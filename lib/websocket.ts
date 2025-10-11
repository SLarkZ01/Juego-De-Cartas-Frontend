import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import type { EventoWebSocket, WsActionRequest } from '@/types/api';
import { authService } from '@/services/auth.service';

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
        console.log('✅ Conectado al WebSocket');

        // Si tenemos usuario, publicar registro de jugador para reconexión
        try {
          const user = authService.getCurrentUser();
          const jugadorId = user?.userId;
          if (jugadorId && client && client.active) {
            const destinoRegistro = '/app/partida/registrar';
            client.publish({
              destination: destinoRegistro,
              body: JSON.stringify({ jugadorId }),
            });
            console.log(`📤 Registrando jugadorId en WS: ${jugadorId}`);
          }
        } catch (err) {
          console.warn('⚠️ No se pudo registrar jugador en WS:', err);
        }
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
            this.client.publish({
              destination: '/app/partida/registrar',
              body: JSON.stringify({ jugadorId: jugadorIdToRegister }),
            });
            console.log(`📤 Registrando jugadorId en WS (suscripción): ${jugadorIdToRegister}`);
          } catch (e) {
            console.warn('⚠️ No se pudo publicar registro de jugador en WS (suscripción):', e);
          }
        }
      }
    } catch (regErr) {
      console.warn('⚠️ Error intentando registrar jugador antes de suscripción:', regErr);
    }

    const subscription = this.client!.subscribe(topic, (message: IMessage) => {
      try {
        if (!message.body) {
          console.warn('⚠️ Mensaje WebSocket sin body');
          return;
        }

        const evento: EventoWebSocket = JSON.parse(message.body);
        
        // Validar que el evento tiene la estructura correcta
        if (!evento || typeof evento !== 'object') {
          console.error('❌ Evento inválido (no es objeto):', evento);
          return;
        }

        if (!evento.tipo) {
          console.error('❌ Evento sin tipo:', evento);
          return;
        }

        console.log('📨 Evento recibido:', evento.tipo, evento);
        onMessage(evento);
      } catch (error) {
        console.error('❌ Error parseando mensaje WS:', error, 'Body:', message.body);
      }
    });

    this.subscriptions.set(topic, subscription);
    console.log(`📡 Suscrito a ${topic}`);
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

  client.onConnect = () => {
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
        client.publish({
          destination: '/app/partida/registrar',
          body: JSON.stringify({ jugadorId }),
        });
        console.log(`📤 Registrando jugadorId en WS (helper): ${jugadorId}`);
      }
    } catch (err) {
      console.warn('⚠️ No se pudo registrar jugador en WS (helper):', err);
    }

    client.subscribe(`/topic/partida/${codigoPartida}`, (msg: IMessage) => {
      try {
        const body = JSON.parse(msg.body);
        onMessage(body);
      } catch (e) {
        console.error('Error parseando mensaje WS', e);
      }
    });
  };

  client.onStompError = (frame) => {
    console.error('STOMP error', frame);
  };

  client.activate();
  return client;
}
