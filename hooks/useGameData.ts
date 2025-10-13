import { useCallback, useEffect, useState } from 'react';
import type { Carta, JugadorPrivate } from '@/types/api';

export function useGameData() {
  const [cartasDB, setCartasDB] = useState<Record<string, Carta>>({});
  const [atributoSeleccionado, setAtributoSeleccionado] = useState<string | null>(null);
  const [miJugador, setMiJugador] = useState<JugadorPrivate | null>(null);
  const [cartasEnMesa, setCartasEnMesa] = useState<Array<{ jugadorId: string; codigoCarta: string; nombreCarta?: string }>>([]);

  const loadCartasDB = useCallback(async () => {
    try {
      const res = await fetch('/api/cartas');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        const map = (data as Carta[]).reduce((a: Record<string, Carta>, c) => { a[c.codigo] = c; return a; }, {});
        setCartasDB(map);
      }
    } catch (e) {
      console.warn('[useGameData] error loading cartasDB', e);
    }
  }, []);

  // Load cartas DB once on mount. Previously this effect depended on `cartasDB` and
  // retried when the fetch returned non-ok (leaving cartasDB empty), causing a loop.
  useEffect(() => {
    loadCartasDB();
  }, [loadCartasDB]);

  const onPartidaIniciada = useCallback(async (event: unknown) => {
    // Ensure cartas DB is loaded when a partida is initiated. loadCartasDB is idempotent
    // for our purposes in dev; if already loaded it will simply refetch.
    await loadCartasDB();
    // if event contiene miJugadorId, podríamos pedir detalle privado fuera
  }, [loadCartasDB]);

  const onAtributoSeleccionado = useCallback((event: unknown) => {
    if (event && typeof event === 'object') {
      const e = event as Record<string, unknown>;
      if ('atributo' in e) setAtributoSeleccionado(e.atributo as string);
    }
  }, []);

  const onCartaJugada = useCallback((event: unknown) => {
    if (!event || typeof event !== 'object') return;
    const e = event as Record<string, any>;
    setCartasEnMesa((prev) => [...prev, {
      jugadorId: String(e.jugadorId),
      codigoCarta: String(e.codigoCarta ?? e.datos?.codigo ?? ''),
      nombreCarta: e.nombreCarta ?? e.datos?.nombre,
    }]);
  }, []);

  const onTransformacion = useCallback((event: unknown) => {
    if (!event || typeof event !== 'object') return;
    const e = event as Record<string, any>;
    if (miJugador && e.jugadorId === miJugador.id) {
      setMiJugador((prev) => prev ? ({ ...prev, transformacionActiva: e.activada ? e.nombreTransformacion : null, indiceTransformacion: e.activada ? e.indiceTransformacion ?? -1 : -1 }) : prev);
    }
  }, [miJugador]);

  const onRondaResuelta = useCallback(async (event: unknown) => {
    // refrescar mano de miJugador si tenemos su id
    if (!miJugador?.id) return;
    try {
      const codigo = (event && typeof event === 'object' && 'codigo' in (event as any)) ? String((event as any).codigo) : undefined;
      if (!codigo) return;
      const detalleRes = await fetch(`/api/partidas/${codigo}/detalle?jugadorId=${miJugador.id}`);
      if (!detalleRes.ok) return;
      const detalle = await detalleRes.json();
      setMiJugador(detalle.miJugador);
      setCartasEnMesa([]);
      setAtributoSeleccionado(null);
    } catch (e) {
      console.warn('[useGameData] error refreshing detalle after ronda', e);
    }
  }, [miJugador]);

  // Handler for counts/topic messages that may include number of cards per jugador
  const onCountsMessage = useCallback((payload: unknown) => {
    try {
      // payload might be { jugadores: [{ id, numeroCartas, ... }, ...] } or { counts: { jugadorId: count } }
      if (!payload) return;

      // Update jugadores counts when payload.jugadores is provided
      const p = payload as Record<string, any>;
      if (Array.isArray(p.jugadores)) {
        const mapa: Record<string, number> = {};
        p.jugadores.forEach((j: any) => {
          if (j && j.id && typeof j.numeroCartas === 'number') mapa[j.id] = j.numeroCartas;
        });

        // Update miJugador.numeroCartas if present
        if (miJugador && miJugador.id && typeof mapa[miJugador.id] === 'number') {
          setMiJugador((prev) => prev ? ({ ...prev, numeroCartas: mapa[miJugador.id] }) : prev);
        }
      }

      // If payload.counts is provided as a map
      if (p.counts && typeof p.counts === 'object') {
        const counts = p.counts as Record<string, number>;
        if (miJugador && miJugador.id && typeof counts[miJugador.id] === 'number') {
          setMiJugador((prev) => prev ? ({ ...prev, numeroCartas: counts[miJugador.id] }) : prev);
        }
      }
    } catch (e) {
      console.warn('[useGameData] onCountsMessage error', e);
    }
  }, [miJugador]);

  return {
    cartasDB,
    miJugador,
    cartasEnMesa,
    atributoSeleccionado,
    handlers: { onPartidaIniciada, onAtributoSeleccionado, onCartaJugada, onTransformacion, onRondaResuelta, onCountsMessage },
    setMiJugador,
    setCartasDB,
  };
}
