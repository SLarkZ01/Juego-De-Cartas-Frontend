// hooks/useLobbyRealTime.ts
import { useEffect, useRef, useState } from 'react';
import SockJS from 'sockjs-client';
import { Client, IMessage } from '@stomp/stompjs';
import api from '@/lib/api';
import type { EventoWebSocket } from '@/types/api';

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
  onPartidaMessage?: (payload: EventoWebSocket) => void,
  onCountsMessage?: (payload: Record<string, number> | Record<string, unknown>) => void,
  typedHandlers?: {
    onPartidaState?: (payload: any) => void;
    onCartaJugada?: (payload: any) => void;
    onAtributoSeleccionado?: (payload: any) => void;
    onTurnoCambiado?: (payload: any) => void;
    onRondaResuelta?: (payload: any) => void;
  }
) {
  const clientRef = useRef<Client | null>(null);
  const [jugadores, setJugadores] = useState<JugadorDTO[]>([]);
  const [turnoActual, setTurnoActual] = useState<string | null>(null);
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
              const parsed: unknown = JSON.parse(msg.body);
              console.log('[useLobbyRealTime] Mensaje recibido (raw parsed):', parsed);
              // si el callback existe y el mensaje tiene estructura compatible, llamarlo
              if (onPartidaMessage && parsed && typeof parsed === 'object') {
                try { onPartidaMessage(parsed as EventoWebSocket); } catch (e) { console.warn('[useLobbyRealTime] onPartidaMessage error', e); }
              }
              // route to typed handlers when provided
              try {
                const p = parsed as Record<string, any>;
                const tipo = String((p.tipo ?? '')).toUpperCase();
                if (tipo === 'PARTIDA_STATE' || Array.isArray(p.jugadores) || p.partida) {
                  try { typedHandlers?.onPartidaState && typedHandlers.onPartidaState(p); } catch {}
                }
                if (tipo === 'CARTA_JUGADA' || tipo === 'CARTA_PLAYED') {
                  try { typedHandlers?.onCartaJugada && typedHandlers.onCartaJugada(p); } catch {}
                }
                if (tipo === 'ATRIBUTO_SELECCIONADO' || tipo === 'ATRIBUTO_SELECTED') {
                  try { typedHandlers?.onAtributoSeleccionado && typedHandlers.onAtributoSeleccionado(p); } catch {}
                }
                if (tipo === 'TURNO_CAMBIADO' || tipo === 'TURN_CHANGED' || tipo.indexOf('TURNO') === 0) {
                  try { typedHandlers?.onTurnoCambiado && typedHandlers.onTurnoCambiado(p); } catch {}
                }
                if (tipo === 'RONDA_RESUELTA' || tipo === 'ROUND_RESOLVED') {
                  try { typedHandlers?.onRondaResuelta && typedHandlers.onRondaResuelta(p); } catch {}
                }
              } catch {
                // ignore routing errors
              }
              // Handle partida eliminada only when backend explicitly sends eliminada === true
              const payload = parsed as Record<string, unknown>;
              const maybeEliminada = payload['eliminada'];
              if (maybeEliminada === true) {
                console.warn('[useLobbyRealTime] Partida marcada como eliminada en WS payload');
                // limpiar lista local y avisar al consumidor
                setJugadores([]);
                setLoading(false);
                if (onPartidaEliminada) onPartidaEliminada();
                return;
              }

              // El servidor puede enviar varios shapes. Primero procesamos TURN_CHANGES explícitos
              // El backend emite eventos TURNO_CAMBIADO con { expectedPlayerId, expectedPlayerNombre }
              if (payload['tipo'] === 'TURNO_CAMBIADO' && typeof payload['expectedPlayerId'] === 'string') {
                const expected = String(payload['expectedPlayerId']);
                console.log('[useLobbyRealTime] Evento TURNO_CAMBIADO recibido. expectedPlayerId=', expected);
                // Actualizamos turnoActual inmediatamente con el id señalado por el servidor.
                setTurnoActual(expected);
                setLoading(false);
                // fallthrough: también avisamos al callback onPartidaMessage arriba
              }

              // El servidor envía un PartidaResponse con { codigo, jugadorId, jugadores }
              const maybeJugadores = payload['jugadores'];
              if (Array.isArray(maybeJugadores)) {
                console.log('[useLobbyRealTime] Actualizando jugadores:', maybeJugadores);
                setJugadores(maybeJugadores as JugadorDTO[]);
                // detect turnoActual at root
                if (typeof payload['turnoActual'] === 'string') setTurnoActual(String(payload['turnoActual']));
                setLoading(false);
              } else {
                const maybePartida = payload['partida'];
                if (maybePartida && typeof maybePartida === 'object') {
                  const nestedJugadores = (maybePartida as Record<string, unknown>)['jugadores'];
                  if (Array.isArray(nestedJugadores)) {
                    console.log('[useLobbyRealTime] Actualizando jugadores (nested):', nestedJugadores);
                    setJugadores(nestedJugadores as JugadorDTO[]);
                    // detect turnoActual nested inside partida
                    const nestedTurn = (maybePartida as Record<string, unknown>)['turnoActual'];
                    if (typeof nestedTurn === 'string') setTurnoActual(String(nestedTurn));
                    setLoading(false);
                    return;
                  }
                }

                const maybeDatos = payload['datos'];
                if (maybeDatos && typeof maybeDatos === 'object') {
                  const datosJug = (maybeDatos as Record<string, unknown>)['jugadores'];
                  if (Array.isArray(datosJug)) {
                    console.log('[useLobbyRealTime] Actualizando jugadores (datos):', datosJug);
                    setJugadores(datosJug as JugadorDTO[]);
                    // detect turnoActual nested inside datos
                    const datosTurn = (maybeDatos as Record<string, unknown>)['turnoActual'];
                    if (typeof datosTurn === 'string') setTurnoActual(String(datosTurn));
                    setLoading(false);
                    return;
                  }
                }

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
                const parsed: unknown = JSON.parse(msg.body);
                if (onCountsMessage && parsed && typeof parsed === 'object') {
                    try { onCountsMessage(parsed as Record<string, number>); } catch (err) { console.warn('[useLobbyRealTime] onCountsMessage error', err); }
                }
              } catch (err) {
                console.warn('[useLobbyRealTime] error parsing counts payload', err);
              }
            });
          } catch {
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
    } catch (err) {
      console.warn('[useLobbyRealTime] Error publishing registrar', err);
    }
  };

  return {
    jugadores: renderJugadores(jugadorId),
    connected,
    loading,
    registerSession,
    client: clientRef.current,
    turnoActual,
  };
}
