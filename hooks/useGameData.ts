import { useCallback, useEffect, useState } from 'react';
import type { Carta } from '@/types/api';

export function useGameData() {
  const [cartasDB, setCartasDB] = useState<Record<string, Carta>>({});
  const [atributoSeleccionado, setAtributoSeleccionado] = useState<string | null>(null);
  const [miJugador, setMiJugador] = useState<any>(null);
  const [cartasEnMesa, setCartasEnMesa] = useState<any[]>([]);

  const loadCartasDB = useCallback(async () => {
    try {
      const res = await fetch('/api/cartas');
      if (!res.ok) return;
      const data = await res.json();
      const map = data.reduce((a: any, c: any) => { a[c.codigo] = c; return a; }, {});
      setCartasDB(map);
    } catch (e) {
      console.warn('[useGameData] error loading cartasDB', e);
    }
  }, []);

  useEffect(() => {
    if (Object.keys(cartasDB).length === 0) {
      loadCartasDB();
    }
  }, [cartasDB, loadCartasDB]);

  const onPartidaIniciada = useCallback(async (event: any) => {
    // reload cartas if empty
    if (Object.keys(cartasDB).length === 0) await loadCartasDB();
    // if event contiene miJugadorId, podríamos pedir detalle privado fuera
  }, [cartasDB, loadCartasDB]);

  const onAtributoSeleccionado = useCallback((event: any) => {
    setAtributoSeleccionado(event.atributo);
  }, []);

  const onCartaJugada = useCallback((event: any) => {
    setCartasEnMesa((prev) => [...prev, {
      jugadorId: event.jugadorId,
      codigoCarta: event.codigoCarta || event.datos?.codigo,
      nombreCarta: event.nombreCarta || event.datos?.nombre,
    }]);
  }, []);

  const onTransformacion = useCallback((event: any) => {
    if (miJugador && event.jugadorId === miJugador.id) {
      setMiJugador((prev: any) => ({ ...prev, transformacionActiva: event.activada ? event.nombreTransformacion : null, indiceTransformacion: event.activada ? event.indiceTransformacion ?? -1 : -1 }));
    }
  }, [miJugador]);

  const onRondaResuelta = useCallback(async (event: any) => {
    // refrescar mano de miJugador si tenemos su id
    if (!miJugador?.id) return;
    try {
      const detalleRes = await fetch(`/api/partidas/${event.codigo}/detalle?jugadorId=${miJugador.id}`);
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
  const onCountsMessage = useCallback((payload: any) => {
    try {
      // payload might be { jugadores: [{ id, numeroCartas, ... }, ...] } or { counts: { jugadorId: count } }
      if (!payload) return;

      // Update jugadores counts when payload.jugadores is provided
      if (Array.isArray(payload.jugadores)) {
        const mapa: Record<string, number> = {};
        payload.jugadores.forEach((j: any) => {
          if (j && j.id && typeof j.numeroCartas === 'number') mapa[j.id] = j.numeroCartas;
        });

        // Update miJugador.numeroCartas if present
        if (miJugador && miJugador.id && typeof mapa[miJugador.id] === 'number') {
          setMiJugador((prev: any) => ({ ...prev, numeroCartas: mapa[miJugador.id] }));
        }
      }

      // If payload.counts is provided as a map
      if (payload.counts && typeof payload.counts === 'object') {
        const counts = payload.counts as Record<string, number>;
        if (miJugador && miJugador.id && typeof counts[miJugador.id] === 'number') {
          setMiJugador((prev: any) => ({ ...prev, numeroCartas: counts[miJugador.id] }));
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
