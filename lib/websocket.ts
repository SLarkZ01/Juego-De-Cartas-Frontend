import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import type { EventoWebSocket, WsActionRequest } from '@/types/api';
import { authService } from '@/services/auth.service';

// Configurable delay (ms) to wait after publishing registration before subscribing
const REGISTRATION_DELAY_MS = Number(process.env.NEXT_PUBLIC_WS_REG_DELAY_MS) || 300;
const REGISTRATION_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function publishRegistrationWithRetry(client: Client, codigoPartida: string, jugadorId: string) {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= REGISTRATION_ATTEMPTS; attempt++) {
    try {
      client.publish({
        destination: '/app/partida/registrar',
        body: JSON.stringify({ jugadorId, partidaCodigo: codigoPartida }),
        skipContentLengthHeader: true,
      });

      console.log(`📤 Registrando jugadorId en WS (attempt ${attempt}): ${jugadorId}`);
      // Wait briefly to allow backend to register mapping before subscription
      await sleep(REGISTRATION_DELAY_MS);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`⚠️ Error publicando registro (attempt ${attempt}):`, err);
      // backoff before retrying
      if (attempt < REGISTRATION_ATTEMPTS) await sleep(100 * attempt);
    }
  }

  throw lastErr;
}

/**
 * Servicio de WebSocket con STOMP
 * Maneja conexiones WebSocket en tiempo real con autenticación JWT
 */
export class WebSocketService {
  private client: Client | null = null;
  private subscriptions: Map<string, StompSubscription> = new Map();
  private userErrorSubscriptions: Map<string, StompSubscription> = new Map();
  private readonly wsUrl: string;

  constructor() {
    this.wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080/ws';
      this.userErrorSubscriptions = new Map();
  }

  /**
   * Crear y configurar cliente STOMP
   */
  private createClient(): Client {
    const client = new Client({
      webSocketFactory: () => new SockJS(this.wsUrl),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      
      // Añadir token JWT en los headers de conexión
      connectHeaders: {
        Authorization: `Bearer ${authService.getToken() || ''}`,
      },

      debug: (str) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[STOMP]', str);
        }
      },

      onConnect: () => {
        // Conectado: no publicamos registro aquí porque no conocemos el codigo de partida.
        // El registro STOMP con { jugadorId, partidaCodigo } se publica justo antes de suscribirse
        // en `subscribeToPartida` para asegurar que el servidor reciba el mapping correcto.
        console.log('✅ Conectado al WebSocket');
      },

      onStompError: (frame) => {
        console.error('❌ Error STOMP:', frame.headers['message']);
        console.error('Detalles:', frame.body);
      },

      onWebSocketClose: () => {
        console.log('🔌 WebSocket cerrado');
      },

      onDisconnect: () => {
        console.log('❌ Desconectado del WebSocket');
      },
    });

    return client;
  }

  /**
   * Conectar al WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.client?.active) {
        resolve();
        return;
      }

      this.client = this.createClient();

      this.client.onConnect = () => {
        console.log('✅ Conectado al WebSocket');
        resolve();
      };

      this.client.onStompError = (frame) => {
        console.error('❌ Error de conexión STOMP:', frame);
        reject(new Error(frame.headers['message'] || 'Error de conexión'));
      };

      this.client.activate();
    });
  }

  /**
   * Suscribirse a una partida
   */
  async subscribeToPartida(
    codigoPartida: string,
    onMessage: (evento: EventoWebSocket) => void
  ): Promise<void> {
    if (!this.client?.active) {
      await this.connect();
    }

    const topic = `/topic/partida/${codigoPartida}`;
    
    // Si ya existe una suscripción, desuscribirse primero
    if (this.subscriptions.has(topic)) {
      this.unsubscribeFromPartida(codigoPartida);
    }

    // Registrar jugadorId en la sesión STOMP antes de suscribirnos, si existe
    try {
      if (typeof window !== 'undefined') {
        const key = `jugadorId_${codigoPartida}`;
        const persisted = localStorage.getItem(key);
        const user = authService.getCurrentUser();
        const jugadorIdToRegister = persisted || user?.userId;

        if (jugadorIdToRegister && this.client && this.client.active) {
          try {
            await publishRegistrationWithRetry(this.client, codigoPartida, jugadorIdToRegister);
          } catch {
            console.warn('⚠️ No se pudo publicar registro de jugador en WS (suscripción) tras reintentos');
                }
        }
      }
    } catch (regErr) {
      console.warn('⚠️ Error intentando registrar jugador antes de suscripción:', regErr);
    }

    const subscription = this.client!.subscribe(topic, (message: IMessage) => {
      try {
        const raw = message.body;
        if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
          if (process.env.NODE_ENV === 'development') console.warn('⚠️ Mensaje WebSocket vacío o no-string recibido:', raw);
          return;
        }

        // Mostrar el body crudo en dev para diagnosticar frames inesperados
        if (process.env.NODE_ENV === 'development') {
          try {
            console.log('WS raw body snippet:', raw.trim().slice(0, 300));
          } catch {
            // ignore
          }
        }

  let parsed: unknown = null;
        try {
          parsed = JSON.parse(raw);
        } catch (parseErr) {
          console.warn('⚠️ No se pudo parsear body WS como JSON, ignorando frame. parseErr:', parseErr, 'Raw snippet:', raw.slice(0, 200));
          return;
        }

  const evento: EventoWebSocket = parsed as EventoWebSocket;

        if (!evento || typeof evento !== 'object') {
          console.warn('⚠️ Evento WS parseado no es un objeto, ignorando:', evento);
          return;
        }

        if (!evento.tipo) {
          // No hacer crash en Next dev overlay — solo warn y no ejecutar handler.
          console.warn('⚠️ Evento sin tipo recibido (ignorando):', evento);
          return;
        }

        console.log('📨 Evento recibido:', evento.tipo, evento);
        onMessage(evento);
      } catch (error) {
        console.error('❌ Error procesando mensaje WS:', error);
      }
    });

    this.subscriptions.set(topic, subscription);
    console.log(`📡 Suscrito a ${topic}`);

    // Después de suscribirnos, publicar registro un par de veces más con retrasos
    // Esto mitiga ventanas de carrera en las que el servidor podría programar la
    // desconexión justo antes de procesar el registro inicial.
    try {
      if (typeof window !== 'undefined') {
        const key = `jugadorId_${codigoPartida}`;
        const persisted = localStorage.getItem(key);
        const user = authService.getCurrentUser();
        const jugadorIdToRegister = persisted || user?.userId;

        if (jugadorIdToRegister && this.client && this.client.active) {
          // intentos adicionales ya separadas (no bloqueantes)
          (async () => {
            try {
              await sleep(400);
              await publishRegistrationWithRetry(this.client!, codigoPartida, jugadorIdToRegister);
            } catch {
              console.warn('⚠️ Re-intento de registro 1 falló');
            }

            try {
              await sleep(800);
              await publishRegistrationWithRetry(this.client!, codigoPartida, jugadorIdToRegister);
            } catch {
              console.warn('⚠️ Re-intento de registro 2 falló');
            }
          })();
        }
      }
    } catch (err) {
      console.warn('⚠️ Error al programar re-intentos de registro post-suscripción:', err);
    }
  }

  /**
   * Suscribirse a una partida pero con handlers separados para eventos clave.
   * Esto permite a los consumidores registrar callbacks específicos en lugar de
   * manejar todo en un único onMessage genérico.
   */
  async subscribeToPartidaWithHandlers(
    codigoPartida: string,
    handlers: {
      onPartidaIniciada?: (payload: EventoWebSocket) => void;
      onCartaJugada?: (payload: EventoWebSocket) => void;
      onRondaResuelta?: (payload: EventoWebSocket) => void;
      onAtributoSeleccionado?: (payload: EventoWebSocket) => void;
      onCounts?: (payload: unknown) => void;
      onGeneric?: (payload: EventoWebSocket) => void;
    }
  ): Promise<void> {
    // subscribe to the main partida topic using the existing method but forward to specific handlers
    await this.subscribeToPartida(codigoPartida, (evento) => {
      try {
        switch (String(evento.tipo)) {
            // partida/estado snapshots
            case 'PARTIDA_INICIADA':
            case 'PARTIDA_STATE':
            case 'PARTIDA_ESTADO':
              handlers.onPartidaIniciada?.(evento);
              break;

            // carta jugada
            case 'CARTA_JUGADA':
              handlers.onCartaJugada?.(evento);
              break;

            // ronda resuelta aliases
            case 'RONDA_COMPLETADA':
            case 'RONDA_RESUELTA':
            case 'ROND A_COMPLETADA':
              handlers.onRondaResuelta?.(evento);
              break;

            // atributo seleccionado
            case 'ATRIBUTO_SELECCIONADO':
            case 'ATRIBUTO_SELECCION':
              handlers.onAtributoSeleccionado?.(evento);
              break;

            // turn change events - forward to generic so callers can handle if they want
            case 'TURNO_CAMBIADO':
            case 'TURN_CHANGED':
            case 'TURN0_CAMBIADO':
              handlers.onGeneric?.(evento);
              break;

            default:
              handlers.onGeneric?.(evento);
              break;
          }
      } catch (err) {
        console.warn('[websocketService] handler error', err);
      }
    });

    // subscribe to counts topic if provided by server
    try {
      if (!this.client?.active) await this.connect();
      const countsTopic = `/topic/partida/${codigoPartida}/counts`;
      // avoid duplicate subscription
      if (!this.subscriptions.has(countsTopic)) {
        const sub = this.client!.subscribe(countsTopic, (msg: IMessage) => {
          try {
            if (!msg.body) return;
            let parsed: unknown = null;
            try { parsed = JSON.parse(msg.body); } catch { parsed = msg.body; }
            handlers.onCounts?.(parsed);
          } catch (e) {
            console.warn('[websocketService] error parsing counts payload', e);
          }
        });
        this.subscriptions.set(countsTopic, sub);
        console.log(`📡 Suscrito a ${countsTopic} (counts)`);
      }
    } catch (err) {
      console.warn('⚠️ No se pudo suscribir a counts topic:', err);
    }
  }

  /**
   * Publicar acción SOLICITAR_ESTADO varias veces (retries con delays) para
   * forzar que el servidor envíe el PartidaResponse canónico si aún no lo hizo.
   */
  solicitarEstadoMultiple(codigoPartida: string, jugadorId?: string, delays: number[] = [0, 300, 900]) {
    if (!this.client?.active) return;

    for (const d of delays) {
      setTimeout(() => {
        try {
          const payload: Record<string, unknown> = { accion: 'SOLICITAR_ESTADO' };
          if (jugadorId) payload.jugadorId = jugadorId;
          this.client!.publish({
            destination: `/app/partida/${codigoPartida}/accion`,
            body: JSON.stringify(payload),
            skipContentLengthHeader: true,
          });
          if (process.env.NODE_ENV === 'development') console.log(`📤 SOLICITAR_ESTADO enviado para ${codigoPartida} (delay ${d}ms)`);
        } catch (err) {
          console.warn('⚠️ Error enviando SOLICITAR_ESTADO:', err);
        }
      }, d);
    }
  }

  /**
   * Aggressive register: publica repetidamente /app/partida/registrar durante
   * una ventana corta para mitigar condiciones de carrera servidor-side.
   */
  aggressiveRegister(codigoPartida: string, jugadorId: string, durationMs = 1800, intervalMs = 300) {
    if (!this.client?.active) return;
    const rounds = Math.max(1, Math.ceil(durationMs / intervalMs));
    for (let i = 0; i < rounds; i++) {
      setTimeout(() => {
        try {
          this.client!.publish({
            destination: '/app/partida/registrar',
            body: JSON.stringify({ jugadorId, partidaCodigo: codigoPartida }),
            skipContentLengthHeader: true,
          });
          if (process.env.NODE_ENV === 'development') console.log(`📤 aggressive register ${i + 1}/${rounds} for ${jugadorId}`);
        } catch {
          // don't throw from aggressive attempts
        }
      }, i * intervalMs);
    }
  }

  /**
   * Desuscribirse de una partida
   */
  unsubscribeFromPartida(codigoPartida: string): void {
    const topic = `/topic/partida/${codigoPartida}`;
    const subscription = this.subscriptions.get(topic);
    
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(topic);
      console.log(`📡 Desuscrito de ${topic}`);
    }

    // Also remove counts subscription if present
    const countsTopic = `/topic/partida/${codigoPartida}/counts`;
    const countsSub = this.subscriptions.get(countsTopic);
    if (countsSub) {
      try { countsSub.unsubscribe(); } catch {}
      this.subscriptions.delete(countsTopic);
      console.log(`📡 Desuscrito de ${countsTopic}`);
    }
  }

  /**
   * Suscribirse al canal de errores dirigidos al usuario: /user/queue/partida/{codigo}/errors
   */
  async subscribeToUserErrors(codigoPartida: string, onError: (err: { message?: string }) => void): Promise<void> {
    if (!this.client?.active) {
      await this.connect();
    }

    const topic = `/user/queue/partida/${codigoPartida}/errors`;
    if (this.userErrorSubscriptions.has(topic)) return;

    try {
      const subscription = this.client!.subscribe(topic, (message: IMessage) => {
        try {
          const raw = message.body;
          if (!raw) return;
          let parsed: unknown = null;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          const payload = parsed as any;
          const msg = (payload && (payload.message || payload.error || payload.msg)) || String(raw || '');
          onError({ message: String(msg) });
        } catch (err) {
          console.warn('Error procesando UserErrorEvent WS:', err);
        }
      });

      this.userErrorSubscriptions.set(topic, subscription);
      console.log(`📡 Suscrito a ${topic} (user errors)`);
    } catch (err) {
      console.warn('No se pudo suscribir a user errors:', err);
    }
  }

  unsubscribeUserErrors(codigoPartida: string): void {
    const topic = `/user/queue/partida/${codigoPartida}/errors`;
    const subscription = this.userErrorSubscriptions.get(topic);
    if (subscription) {
      try {
        subscription.unsubscribe();
      } catch {}
      this.userErrorSubscriptions.delete(topic);
      console.log(`📡 Desuscrito de ${topic} (user errors)`);
    }
  }

  /**
   * Enviar acción al servidor
   */
  sendAction(codigoPartida: string, action: WsActionRequest): void {
    if (!this.client?.active) {
      console.error('❌ Cliente WebSocket no está activo');
      return;
    }

    const destination = `/app/partida/${codigoPartida}/accion`;
    
    this.client.publish({
      destination,
      body: JSON.stringify(action),
    });

    console.log(`📤 Acción enviada a ${destination}:`, action);
  }

  /**
   * Desconectar del WebSocket
   */
  disconnect(): void {
    // Desuscribirse de todos los topics
    this.subscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    this.subscriptions.clear();

    // Desactivar cliente
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }

    console.log('🔌 WebSocket desconectado');
  }

  /**
   * Verificar si está conectado
   */
  isConnected(): boolean {
    return this.client?.active || false;
  }
}

// Exportar instancia singleton
export const websocketService = new WebSocketService();

// Helper functions para retrocompatibilidad
export function crearClienteStomp(brokerUrl?: string): Client {
  const url = brokerUrl || process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080/ws';
  
  const client = new Client({
    webSocketFactory: () => new SockJS(url),
    reconnectDelay: 5000,
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
    connectHeaders: {
      Authorization: `Bearer ${authService.getToken() || ''}`,
    },
  });

  return client;
}

export function conectarYSuscribir(
  codigoPartida: string,
  onMessage: (payload: EventoWebSocket) => void
): Client {
  const client = crearClienteStomp();

  client.onConnect = async () => {
    // Publicar registro de jugador para reconexión si tenemos jugadorId (se intenta leer localStorage por partida)
    try {
      const key = `jugadorId_${codigoPartida}`;
      let jugadorId: string | undefined;
      try {
        jugadorId = typeof window !== 'undefined' ? localStorage.getItem(key) || undefined : undefined;
      } catch (e) {
        console.warn('No se pudo leer jugadorId de localStorage (helper):', e);
      }

      if (!jugadorId) {
        const user = authService.getCurrentUser();
        jugadorId = user?.userId;
      }

      if (jugadorId && client && client.active) {
        try {
          await publishRegistrationWithRetry(client, codigoPartida, jugadorId);
        } catch (e) {
          console.warn('⚠️ No se pudo registrar jugador en WS (helper) tras reintentos:', e);
        }
      }
    } catch (err) {
      console.warn('⚠️ No se pudo registrar jugador en WS (helper):', err);
    }

    client.subscribe(`/topic/partida/${codigoPartida}`, (msg: IMessage) => {
      try {
        const raw = msg.body;
        if (!raw || typeof raw !== 'string' || raw.trim().length === 0) return;
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          console.warn('⚠️ Error parseando mensaje WS (helper):', e, 'Raw:', raw.slice(0,200));
          return;
        }
        // Guardar validación ligera
        if (!parsed || typeof parsed !== 'object' || !('tipo' in parsed)) {
          console.warn('⚠️ Mensaje WS (helper) inválido o sin tipo, ignorando:', parsed);
          return;
        }
        onMessage(parsed as EventoWebSocket);
      } catch (e) {
        console.error('Error procesando mensaje WS (helper):', e);
      }
    });
  };

  client.onStompError = (frame) => {
    console.error('STOMP error', frame);
  };

  client.activate();
  return client;
}
