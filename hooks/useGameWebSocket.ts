import { useEffect, useRef } from 'react';
import { Client, Frame, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { readJugadorId } from '@/lib/partidaUtils';

/**
 * Hook pequeño para conectar STOMP y registrar jugador en la partida
 * - lee jugadorId desde localStorage
 * - se suscribe a /topic/partida/{codigo}
 */
export function useGameWebSocket(codigoPartida: string | null, onMessage: (payload: any) => void) {
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    if (!codigoPartida) return;

  const jugadorId = readJugadorId(codigoPartida || '') || (typeof window !== 'undefined' ? localStorage.getItem('jugadorId') : undefined);
    const url = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080/ws';

    const client = new Client({
      webSocketFactory: () => new SockJS(url),
      reconnectDelay: 5000,
      onConnect: (frame: Frame) => {
        console.log('[useGameWebSocket] WS conectado', frame);
        try {
          client.subscribe(`/topic/partida/${codigoPartida}`, (msg: IMessage) => {
            try {
              const payload = JSON.parse(msg.body);
              onMessage(payload);
            } catch (e) {
              console.error('[useGameWebSocket] error parsing payload', e);
            }
          });

          // Registrar jugador para cancelar grace y asociar sessionId
          const registrarPayload = { jugadorId, partidaCodigo: codigoPartida };
          client.publish({ destination: '/app/partida/registrar', body: JSON.stringify(registrarPayload) });
        } catch (e) {
          console.warn('[useGameWebSocket] error during onConnect', e);
        }
      },
      onStompError: (frame) => console.error('[useGameWebSocket] STOMP error', frame),
      onDisconnect: () => console.log('[useGameWebSocket] WS desconectado'),
    });

    client.activate();
    clientRef.current = client;

    return () => {
      try {
        client.deactivate();
      } catch (e) {}
      clientRef.current = null;
    };
  }, [codigoPartida, onMessage]);
}
