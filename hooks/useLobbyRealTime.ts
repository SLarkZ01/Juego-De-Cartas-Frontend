// hooks/useLobbyRealTime.ts
import { useEffect, useRef, useState } from 'react';
import SockJS from 'sockjs-client';
import { Client, IMessage } from '@stomp/stompjs';
import api from '@/lib/api';

export interface JugadorDTO {
  id: string;
  userId: string;
  nombre: string;
  orden: number;
  conectado?: boolean;
  ki?: number;
  numeroCartas?: number;
  // ...otros campos que necesites
}

export interface PartidaResponseWS {
  codigo: string;
  jugadorId?: string | null;
  jugadores: JugadorDTO[];
}

export function useLobbyRealTime(partidaCodigo: string | null, jugadorId?: string | null) {
  const clientRef = useRef<Client | null>(null);
  const [jugadores, setJugadores] = useState<JugadorDTO[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partidaCodigo) return;

    let mounted = true;
    setLoading(true);

    const doReconnectREST = async () => {
      if (!jugadorId) return;
      try {
        console.log('[useLobbyRealTime] Reconectando REST:', partidaCodigo, jugadorId);
        await api.post(`/api/partidas/${partidaCodigo}/reconectar`, { jugadorId });
      } catch (e) {
        console.warn('[useLobbyRealTime] Reconectar REST falló:', e);
      }
    };

    const connectWS = async () => {
      await doReconnectREST();

      const socket = new SockJS(`${process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080/ws'}`);
      const client = new Client({
        webSocketFactory: () => socket,
        debug: (str) => {
          // Descomentar para debug detallado:
          if (process.env.NODE_ENV === 'development') {
            console.log('[STOMP]', str);
          }
        },
        onConnect: () => {
          console.log('[useLobbyRealTime] WS conectado');
          setConnected(true);
          
          // Registrar sesión con jugadorId y partidaCodigo
          if (jugadorId) {
            console.log('[useLobbyRealTime] Registrando jugador:', jugadorId, partidaCodigo);
            client.publish({
              destination: '/app/partida/registrar',
              body: JSON.stringify({ jugadorId, partidaCodigo }),
              skipContentLengthHeader: true,
            });
          }

          // Suscribirse al topic de la partida
          console.log('[useLobbyRealTime] Suscribiendo a:', `/topic/partida/${partidaCodigo}`);
          client.subscribe(`/topic/partida/${partidaCodigo}`, (msg: IMessage) => {
            if (!mounted) return;
            
            try {
              const payload = JSON.parse(msg.body);
              console.log('[useLobbyRealTime] Mensaje recibido:', payload);

              // El servidor envía un PartidaResponse con { codigo, jugadorId, jugadores }
              if (payload && Array.isArray(payload.jugadores)) {
                console.log('[useLobbyRealTime] Actualizando jugadores:', payload.jugadores);
                setJugadores(payload.jugadores);
                setLoading(false);
              } else if (payload.partida && Array.isArray(payload.partida.jugadores)) {
                // Algunos eventos anidan la partida
                console.log('[useLobbyRealTime] Actualizando jugadores (nested):', payload.partida.jugadores);
                setJugadores(payload.partida.jugadores);
                setLoading(false);
              } else if (payload.datos && Array.isArray(payload.datos.jugadores)) {
                // Eventos WebSocket con estructura { tipo, datos, timestamp }
                console.log('[useLobbyRealTime] Actualizando jugadores (datos):', payload.datos.jugadores);
                setJugadores(payload.datos.jugadores);
                setLoading(false);
              } else {
                console.warn('[useLobbyRealTime] Payload sin jugadores:', payload);
              }
            } catch (err) {
              console.error('[useLobbyRealTime] Error parseando mensaje WS:', err);
            }
          });
        },
        onDisconnect: () => {
          console.log('[useLobbyRealTime] WS desconectado');
          setConnected(false);
        },
        onStompError: (err) => {
          console.error('[useLobbyRealTime] STOMP error:', err);
        },
      });

      client.activate();
      clientRef.current = client;
    };

    connectWS();

    return () => {
      console.log('[useLobbyRealTime] Cleanup');
      mounted = false;
      clientRef.current?.deactivate();
    };
  }, [partidaCodigo, jugadorId]);

  const renderJugadores = (meId?: string | null) =>
    jugadores.map((j) => ({ ...j, isMe: !!meId && j.id === meId }));

  return { 
    jugadores: renderJugadores(jugadorId), 
    connected, 
    loading 
  };
}
