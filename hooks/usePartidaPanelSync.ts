import { useCallback, useEffect, useState } from 'react';
import { Client, IMessage } from '@stomp/stompjs';

type JugadorPanel = {
  id: string;
  nombre: string;
  numeroCartas: number;
  orden: number;
  conectado: boolean;
};

export function usePartidaPanelSync(client: Client | null, partidaCodigo: string | null, myJugadorId?: string | null, options?: { autoSubscribe?: boolean }) {
  const [jugadores, setJugadores] = useState<JugadorPanel[]>([]);
  const [turnoActual, setTurnoActual] = useState<string | null>(null);
  const [turnoEsperado, setTurnoEsperado] = useState<string | null>(null);

  const handlePartidaMessage = useCallback((msg: IMessage) => {
    try {
      const body = JSON.parse(msg.body);
      if (process.env.NODE_ENV === 'development') {
        try { console.debug('[usePartidaPanelSync] WS raw partida message:', body); } catch {}
      }
      // If payload is an EventoWebSocket wrapper (has tipo/datos), handle known event types
      if (body && typeof body === 'object' && typeof body.tipo === 'string') {
        const tipo = String(body.tipo);
        const datos = body.datos || body.data || body.payload || null;
        if (process.env.NODE_ENV === 'development') {
          try { console.debug('[usePartidaPanelSync] Evento WS tipo:', tipo, 'datos:', datos); } catch {}
        }
        // Handle TurnoCambiado event
        if (tipo === 'TURNO_CAMBIADO' || tipo === 'TURN0_CAMBIADO' || tipo === 'TURNO_CAMBIO' || tipo === 'TURN_CHANGED') {
          try {
            const expected = datos?.expectedPlayerId ?? datos?.expectedPlayer ?? datos?.jugadorId ?? datos?.playerId ?? datos?.expected ?? null;
            if (process.env.NODE_ENV === 'development') {
              try { console.debug('[usePartidaPanelSync] detected turno cambiado, expected:', expected); } catch {}
            }
            if (expected && typeof expected === 'string') setTurnoEsperado(String(expected));
          } catch (e) {
            // ignore
          }
        }
        // If event includes a partida snapshot inside datos, extract jugadores/turnoActual from there
        if (datos && typeof datos === 'object' && Array.isArray(datos.jugadores)) {
          const parsed = (datos.jugadores as any[]).map((j) => ({
            id: j.id,
            nombre: j.nombre ?? j.userId ?? String(j.id),
            numeroCartas: typeof j.numeroCartas === 'number' ? j.numeroCartas : 0,
            orden: typeof j.orden === 'number' ? j.orden : 0,
            conectado: !!j.conectado,
          }));
          parsed.sort((a,b) => a.orden - b.orden);
          setJugadores(parsed);
          if (typeof datos.turnoActual === 'string') setTurnoActual(datos.turnoActual);
          return;
        }
      }

      if (body && body.jugadores && Array.isArray(body.jugadores)) {
        const parsed = (body.jugadores as any[]).map((j) => ({
          id: j.id,
          nombre: j.nombre ?? j.userId ?? String(j.id),
          numeroCartas: typeof j.numeroCartas === 'number' ? j.numeroCartas : 0,
          orden: typeof j.orden === 'number' ? j.orden : 0,
          conectado: !!j.conectado,
        }));
        parsed.sort((a,b) => a.orden - b.orden);
        setJugadores(parsed);
        if (typeof body.turnoActual === 'string') setTurnoActual(body.turnoActual);
      }
    } catch (e) {
      console.warn('[usePartidaPanelSync] parse partida message error', e);
    }
  }, []);

  const handleCounts = useCallback((msg: IMessage) => {
    try {
      const body = JSON.parse(msg.body);
      if (!body) return;
      // accept either { counts: [{ jugadorId, count }] } or { jugadores: [...] }
      if (Array.isArray(body.jugadores)) {
        setJugadores((prev) => {
          const map = new Map(prev.map(p => [p.id, p]));
          for (const j of body.jugadores) {
            const existing = map.get(j.id);
            if (existing) existing.numeroCartas = typeof j.numeroCartas === 'number' ? j.numeroCartas : existing.numeroCartas;
          }
          return Array.from(map.values()).sort((a,b) => a.orden - b.orden);
        });
        return;
      }

      if (body.counts && Array.isArray(body.counts)) {
        setJugadores((prev) => {
          const map = new Map(prev.map(p => [p.id, p]));
          for (const c of body.counts) {
            const existing = map.get(c.jugadorId);
            if (existing) existing.numeroCartas = typeof c.count === 'number' ? c.count : existing.numeroCartas;
          }
          return Array.from(map.values()).sort((a,b) => a.orden - b.orden);
        });
      }
    } catch (e) {
      console.warn('[usePartidaPanelSync] parse counts error', e);
    }
  }, []);

  // If autoSubscribe is enabled (default), the hook will create its own subscriptions
  // to the STOMP client. If a central subscriber is preferred, pass { autoSubscribe: false }
  // and instead use the handler functions returned by this hook (handlePartidaPayload, handleCountsPayload).
  useEffect(() => {
    const auto = options?.autoSubscribe ?? true;
    if (!auto) return;
    if (!client || !partidaCodigo) return;
    let subPartida: any = null;
    let subCounts: any = null;
    try {
      subPartida = client.subscribe(`/topic/partida/${partidaCodigo}`, (msg: IMessage) => handlePartidaMessage(msg));
    } catch (e) {
      console.warn('[usePartidaPanelSync] subscribe partida failed', e);
    }
    try {
      subCounts = client.subscribe(`/topic/partida/${partidaCodigo}/counts`, (msg: IMessage) => handleCounts(msg));
    } catch (e) {
      // counts topic optional
    }

    return () => {
      try { subPartida && subPartida.unsubscribe(); } catch {}
      try { subCounts && subCounts.unsubscribe(); } catch {}
    };
  }, [client, partidaCodigo, handlePartidaMessage, handleCounts, options]);

  // Handlers exposed so a central subscriber can call them with a parsed payload
  const handlePartidaPayload = (payload: any) => {
    try {
      // Reuse parsing logic by constructing a faux IMessage-like object with a body
      const msg = { body: JSON.stringify(payload) } as unknown as IMessage;
      handlePartidaMessage(msg);
    } catch (e) {
      console.warn('[usePartidaPanelSync] handlePartidaPayload error', e);
    }
  };

  const handleCountsPayload = (payload: any) => {
    try {
      const msg = { body: JSON.stringify(payload) } as unknown as IMessage;
      handleCounts(msg);
    } catch (e) {
      console.warn('[usePartidaPanelSync] handleCountsPayload error', e);
    }
  };

  return { jugadores, setJugadores, turnoActual, setTurnoActual, turnoEsperado, setTurnoEsperado, handlePartidaPayload, handleCountsPayload };
}

export default usePartidaPanelSync;
