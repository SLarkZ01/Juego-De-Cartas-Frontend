import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import type { EventoWebSocket, WsActionRequest } from '@/types/api';
import { authService } from '@/services/auth.service';

// Configurable delay (ms) to wait after publishing registration before subscribing
const REGISTRATION_DELAY_MS = Number(process.env.NEXT_PUBLIC_WS_REG_DELAY_MS) || 300;
const REGISTRATION_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function publishRegistrationWithRetry(client: Client, codigoPartida: string, jugadorId: string) {
  let lastErr: any = null;
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
    } catch (e) {
      lastErr = e;
      console.warn(`⚠️ Error publicando registro (attempt ${attempt}):`, e);
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
  private readonly wsUrl: string;

  constructor() {
    this.wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080/ws';
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
          } catch (e) {
            console.warn('⚠️ No se pudo publicar registro de jugador en WS (suscripción) tras reintentos:', e);
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
          } catch (e) {
            // ignore
          }
        }

        let parsed: any = null;
        try {
          parsed = JSON.parse(raw);
        } catch (parseErr) {
          console.warn('⚠️ No se pudo parsear body WS como JSON, ignorando frame. Raw:', raw.slice(0, 200));
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
            } catch (e) {
              console.warn('⚠️ Re-intento de registro 1 falló:', e);
            }

            try {
              await sleep(800);
              await publishRegistrationWithRetry(this.client!, codigoPartida, jugadorIdToRegister);
            } catch (e) {
              console.warn('⚠️ Re-intento de registro 2 falló:', e);
            }
          })();
        }
      }
    } catch (err) {
      console.warn('⚠️ Error al programar re-intentos de registro post-suscripción:', err);
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
  onMessage: (payload: any) => void
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
        let parsed: any = null;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          console.warn('⚠️ Error parseando mensaje WS (helper):', e, 'Raw:', raw.slice(0,200));
          return;
        }
        // Guardar validación ligera
        if (!parsed || typeof parsed !== 'object' || !parsed.tipo) {
          console.warn('⚠️ Mensaje WS (helper) inválido o sin tipo, ignorando:', parsed);
          return;
        }
        onMessage(parsed);
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
