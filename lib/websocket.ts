import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export function crearClienteStomp(brokerUrl?: string) {
  const url = brokerUrl || process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080/ws';

  const client = new Client({
    // Use SockJS factory for compatibility if server habilita SockJS
    webSocketFactory: () => new SockJS(url),
    reconnectDelay: 5000,
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
  });

  return client;
}

export function conectarYSuscribir(codigoPartida: string, onMessage: (payload: any) => void) {
  const client = crearClienteStomp();

  client.onConnect = () => {
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
