import { useCallback, useEffect, useState } from 'react';
import type { Carta, JugadorPrivate } from '@/types/api';
import { websocketService } from '@/lib/websocket';

export function useGameData() {
  const [cartasDB, setCartasDB] = useState<Record<string, Carta>>({});
  const [atributoSeleccionado, setAtributoSeleccionado] = useState<string | null>(null);
  const [miJugador, setMiJugador] = useState<JugadorPrivate | null>(null);
  const [cartasEnMesa, setCartasEnMesa] = useState<Array<{ jugadorId: string; codigoCarta: string; nombreCarta?: string }>>([]);
  const [resolviendo, setResolviendo] = useState(false);
  const [rondaResultado, setRondaResultado] = useState<any | null>(null);

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
    // Mark that a ronda is being resolved and store its payload so the UI (Mesa)
    // can perform the collect animation before we clear the mesa and refresh.
    try {
      setRondaResultado(event ?? null);
      setResolviendo(true);
    } catch (e) {
      console.warn('[useGameData] onRondaResuelta error', e);
    }
  }, [miJugador]);

  // Called by the UI after animations complete to finalize the resolution:
  // - refresh detalle (miJugador) from server
  // - clear cartasEnMesa and atributoSeleccionado
  // - unset resolviendo/rondaResultado
  const completeResolution = useCallback(async () => {
    try {
      const codigo = (typeof window !== 'undefined' && (window as any).__CURRENT_PARTIDA_CODIGO) ? String((window as any).__CURRENT_PARTIDA_CODIGO) : undefined;
      if (!codigo) {
        // no partida context: just clear local state
        setCartasEnMesa([]);
        setAtributoSeleccionado(null);
        setResolviendo(false);
        setRondaResultado(null);
        return;
      }

      if (!miJugador?.id) {
        setCartasEnMesa([]);
        setAtributoSeleccionado(null);
        setResolviendo(false);
        setRondaResultado(null);
        return;
      }

      const detalleRes = await fetch(`/api/partidas/${codigo}/detalle?jugadorId=${miJugador.id}`);
      if (detalleRes.ok) {
        const detalle = await detalleRes.json();
        setMiJugador(detalle.miJugador);
      }
      setCartasEnMesa([]);
      setAtributoSeleccionado(null);
    } catch (e) {
      console.warn('[useGameData] completeResolution error', e);
    } finally {
      setResolviendo(false);
      setRondaResultado(null);
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

  // Subscribe to WebSocket partida topics when a partida codigo is set in the app logic.
  // The consumer should ensure this hook is mounted for the current partida page.
  useEffect(() => {
    // This hook doesn't know the current codigo; consumers can subscribe manually via websocketService
    // But to help integration, if an external script sets window.__CURRENT_PARTIDA_CODIGO we can auto-subscribe (optional)
    try {
      const maybeCodigo = (typeof window !== 'undefined' && (window as any).__CURRENT_PARTIDA_CODIGO) ? String((window as any).__CURRENT_PARTIDA_CODIGO) : undefined;
      if (!maybeCodigo) return;

      let mounted = true;
      (async () => {
        try {
          await websocketService.subscribeToPartidaWithHandlers(maybeCodigo, {
            onPartidaIniciada: (ev) => { if (!mounted) return; onPartidaIniciada(ev); },
            onAtributoSeleccionado: (ev) => { if (!mounted) return; onAtributoSeleccionado(ev); },
            onCartaJugada: (ev) => { if (!mounted) return; onCartaJugada(ev); },
            onRondaResuelta: (ev) => { if (!mounted) return; onRondaResuelta(ev); },
            onCounts: (p) => { if (!mounted) return; onCountsMessage(p); },
            onGeneric: (ev) => { /* no-op for now */ },
          });
        } catch (e) {
          console.warn('[useGameData] subscribeToPartidaWithHandlers failed', e);
        }
      })();

      return () => {
        mounted = false;
        try {
          if (maybeCodigo) websocketService.unsubscribeFromPartida(maybeCodigo);
        } catch {}
      };
    } catch (e) {
      // ignore
    }
  }, [onPartidaIniciada, onAtributoSeleccionado, onCartaJugada, onRondaResuelta, onCountsMessage]);

  return {
    cartasDB,
    miJugador,
    cartasEnMesa,
    atributoSeleccionado,
    resolviendo,
    rondaResultado,
    handlers: { onPartidaIniciada, onAtributoSeleccionado, onCartaJugada, onTransformacion, onRondaResuelta, onCountsMessage },
    setMiJugador,
    setCartasDB,
    completeResolution,
  };
}
