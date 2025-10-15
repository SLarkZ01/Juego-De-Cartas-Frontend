import { useCallback, useEffect, useState } from 'react';
import { Client, IMessage } from '@stomp/stompjs';

type JugadorPanel = {
  id: string;
  nombre: string;
  numeroCartas: number;
  orden: number;
  conectado: boolean;
};

export function usePartidaPanelSync(client: Client | null, partidaCodigo: string | null, myJugadorId?: string | null) {
  const [jugadores, setJugadores] = useState<JugadorPanel[]>([]);
  const [turnoActual, setTurnoActual] = useState<string | null>(null);

  const handlePartidaMessage = useCallback((msg: IMessage) => {
    try {
      const body = JSON.parse(msg.body);
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

  useEffect(() => {
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
  }, [client, partidaCodigo, handlePartidaMessage, handleCounts]);

  return { jugadores, setJugadores, turnoActual, setTurnoActual };
}

export default usePartidaPanelSync;
