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
  jugadores: JugadorDTO[] | null;
  eliminada?: boolean;
}
export function useLobbyRealTime(
  partidaCodigo: string | null,
  jugadorId?: string | null,
  onPartidaEliminada?: () => void,
  onPartidaMessage?: (payload: any) => void,
  onCountsMessage?: (payload: any) => void,
) {
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
              if (onPartidaMessage) {
                try { onPartidaMessage(payload); } catch (e) { console.warn('[useLobbyRealTime] onPartidaMessage error', e); }
              }
              // Handle partida eliminada only when backend explicitly sends eliminada === true
              if (payload && payload.eliminada === true) {
                console.warn('[useLobbyRealTime] Partida marcada como eliminada en WS payload');
                // limpiar lista local y avisar al consumidor
                setJugadores([]);
                setLoading(false);
                if (onPartidaEliminada) onPartidaEliminada();
                return;
              }

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

          // Suscribirse a counts topic si disponible
          try {
            client.subscribe(`/topic/partida/${partidaCodigo}/counts`, (msg: IMessage) => {
              if (!mounted) return;
              try {
                const payload = JSON.parse(msg.body);
                if (onCountsMessage) {
                  try { onCountsMessage(payload); } catch (e) { console.warn('[useLobbyRealTime] onCountsMessage error', e); }
                }
              } catch (e) {
                console.warn('[useLobbyRealTime] error parsing counts payload', e);
              }
            });
          } catch (e) {
            // ignore if topic not available
          }
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

  // Function to explicitly register the session -> jugador mapping
  const registerSession = (jId?: string | null) => {
    try {
      const client = clientRef.current;
      if (!client) {
        console.warn('[useLobbyRealTime] registerSession: no STOMP client available yet');
        return;
      }
      const payload = { jugadorId: jId, partidaCodigo };
      client.publish({ destination: '/app/partida/registrar', body: JSON.stringify(payload), skipContentLengthHeader: true });
      if (process.env.NODE_ENV === 'development') console.log('[useLobbyRealTime] registerSession published', payload);
    } catch (e) {
      console.warn('[useLobbyRealTime] Error publishing registrar', e);
    }
  };

  return {
    jugadores: renderJugadores(jugadorId),
    connected,
    loading,
    registerSession,
  };
}
