import { useCallback, useEffect, useState } from 'react';
import type { Carta, JugadorPrivate } from '@/types/api';
import { websocketService } from '@/lib/websocket';
import api from '@/lib/api';

export function useGameData() {
  const [cartasDB, setCartasDB] = useState<Record<string, Carta>>({});
  const [atributoSeleccionado, setAtributoSeleccionado] = useState<string | null>(null);
  const [miJugador, setMiJugador] = useState<JugadorPrivate | null>(null);
  const [cartasEnMesa, setCartasEnMesa] = useState<Array<{ jugadorId: string; codigoCarta: string; nombreCarta?: string; atributoSeleccionado?: string; valorAtributo?: number; jugadorNombre?: string }>>([]);
  const [resolviendo, setResolviendo] = useState(false);
  const [rondaResultado, setRondaResultado] = useState<any | null>(null);

  const loadCartasDB = useCallback(async () => {
    try {
      const res = await api.get('/api/cartas');
      const data = res && res.data ? res.data : [];
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
    // Intentionally left light: do not re-fetch cartasDB on every PARTIDA_STATE to
    // avoid repeated network calls and render loops. Consumers may call loadCartasDB()
    // once on mount if needed.
  }, [loadCartasDB]);

  const onAtributoSeleccionado = useCallback((event: unknown) => {
    if (event && typeof event === 'object') {
      const e = event as Record<string, any>;
      if ('atributo' in e) {
        const atributo = e.atributo as string;
        setAtributoSeleccionado(atributo);

        try {
          // If a carta already exists on mesa for this jugador or cartaCodigo, attach the atributo to it
          setCartasEnMesa((prev) => {
            if (!prev || prev.length === 0) return prev;
            const jugadorId = e.jugadorId ? String(e.jugadorId) : undefined;
            const cartaCodigo = e.cartaCodigo ? String(e.cartaCodigo) : (e.datos && e.datos.codigo ? String(e.datos.codigo) : undefined);
            return prev.map((c) => {
              try {
                if ((jugadorId && String(c.jugadorId) === String(jugadorId)) || (c.codigoCarta && cartaCodigo && String(c.codigoCarta) === String(cartaCodigo))) {
                  const jugadorNombre = e.nombreJugador ?? e.jugadorNombre ?? e.datos?.jugadorNombre ?? undefined;
                  return { ...c, atributoSeleccionado: atributo, valorAtributo: e.valor ?? e.valorAtributo ?? undefined, jugadorNombre };
                }
              } catch {}
              return c;
            });
          });
        } catch (err) {
          console.warn('[useGameData] onAtributoSeleccionado update cartasEnMesa failed', err);
        }
      }
    }
  }, []);

  const onCartaJugada = useCallback((event: unknown) => {
    if (!event || typeof event !== 'object') return;
    const e = event as Record<string, any>;
    // If there's an atributoSeleccionado currently active, attach it to the carta en mesa
    const currentAtributo = atributoSeleccionado;
    const codigo = String(e.codigoCarta ?? e.datos?.codigo ?? '');
    const entry: any = {
      jugadorId: String(e.jugadorId),
      codigoCarta: codigo,
      nombreCarta: e.nombreCarta ?? e.datos?.nombre,
    };
    if (currentAtributo) {
      entry.atributoSeleccionado = currentAtributo;
      entry.valorAtributo = e.valor ?? e.valorAtributo ?? undefined;
    } else if (e.atributo) {
      entry.atributoSeleccionado = e.atributo;
      entry.valorAtributo = e.valor ?? e.valorAtributo ?? undefined;
    }

    // also try to include jugadorNombre if provided by the event
    if (e.jugadorNombre || e.nombreJugador || e.datos?.jugadorNombre) entry.jugadorNombre = e.jugadorNombre ?? e.nombreJugador ?? e.datos?.jugadorNombre;

    setCartasEnMesa((prev) => [...prev, entry]);

    // Immediate local update: if the carta fue jugada por miJugador, decrementar su numeroCartas
    try {
      if (miJugador && miJugador.id && String(miJugador.id) === String(e.jugadorId)) {
        setMiJugador((prev) => prev ? ({ ...prev, numeroCartas: Math.max(0, (prev.numeroCartas ?? 0) - 1) }) : prev);
      }
    } catch (err) {
      // ignore
    }
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
      const evt = event ?? null;
      setRondaResultado(evt);
      setResolviendo(true);
      try {
        // Ask server for canonical state so counts and mesa get refreshed for all clients
        const codigo = (typeof window !== 'undefined' && (window as any).__CURRENT_PARTIDA_CODIGO) ? String((window as any).__CURRENT_PARTIDA_CODIGO) : undefined;
        if (codigo) websocketService.solicitarEstadoMultiple(codigo);

        // If the event contains immediate counts or a winner, update local miJugador immediately
        try {
          const payload = evt as any;
          const ganadorId = payload?.ganadorId ?? payload?.datos?.ganadorId ?? payload?.winnerId ?? null;
          // counts may come as payload.counts = [{ jugadorId, numeroCartas, nombre }]
          const counts = payload?.counts ?? payload?.jugadores ?? null;

          if (Array.isArray(counts)) {
            // If counts include this client, update miJugador.numeroCartas
            try {
              if (miJugador && miJugador.id) {
                const found = counts.find((c: any) => String(c.jugadorId) === String(miJugador.id));
                if (found && typeof found.numeroCartas === 'number') {
                  setMiJugador((prev) => prev ? ({ ...prev, numeroCartas: found.numeroCartas }) : prev);
                }
              }
            } catch {}
          }

          // If I'm the winner, try to fetch detalle to update my mano (cards added to winner)
          if (ganadorId && miJugador && String(ganadorId) === String(miJugador.id) && codigo) {
            try {
              // fetch updated detalle (winner gets added cards) via axios api instance
              const detalleRes = await api.get(`/api/partidas/${codigo}/detalle`, { params: { jugadorId: miJugador.id } });
              const detalle = detalleRes && detalleRes.data ? detalleRes.data : null;
              if (detalle && detalle.miJugador) setMiJugador(detalle.miJugador);
            } catch (err) {
              // ignore fetch errors
            }
          }
        } catch (err) {
          // ignore per-event processing errors
        }
      } catch {}
    } catch (e) {
      console.warn('[useGameData] onRondaResuelta error', e);
    }
  }, [miJugador]);

  // Fallback: if after a short delay the animation path hasn't cleared the mesa,
  // perform a forced resolution to keep all clients synced (useful for headless
  // clients or clients that missed the animation lifecycle).
  useEffect(() => {
    let timer: number | undefined = undefined;
    try {
      if (!rondaResultado) return;

      timer = window.setTimeout(async () => {
        try {
          // If still resolving, attempt to refresh detalle and clear local mesa
          if (rondaResultado) {
            const codigo = (typeof window !== 'undefined' && (window as any).__CURRENT_PARTIDA_CODIGO) ? String((window as any).__CURRENT_PARTIDA_CODIGO) : undefined;
            // fetch detalle to update miJugador counts
            if (codigo && miJugador?.id) {
              try {
                const detalleRes = await api.get(`/api/partidas/${codigo}/detalle`, { params: { jugadorId: miJugador.id } });
                const detalle = detalleRes && detalleRes.data ? detalleRes.data : null;
                if (detalle && detalle.miJugador) setMiJugador(detalle.miJugador);
              } catch (err) {
                // ignore fetch errors
              }
            }

            // Clear mesa state so the UI doesn't keep old cards
            setCartasEnMesa([]);
            setAtributoSeleccionado(null);
            setResolviendo(false);
            setRondaResultado(null);
          }
        } catch (err) {
          // ignore
        }
      }, 1400);
    } catch {}

    return () => { try { if (timer) clearTimeout(timer); } catch {} };
  }, [rondaResultado, miJugador]);

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

      const detalleRes = await api.get(`/api/partidas/${codigo}/detalle`, { params: { jugadorId: miJugador.id } });
      const detalle = detalleRes && detalleRes.data ? detalleRes.data : null;
      if (detalle && detalle.miJugador) {
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

  // NOTE: Removed auto-subscription to WebSocket topics to avoid duplicate
  // subscriptions when consumers (e.g., JuegoPage) already subscribe centrally.
  // Consumers should use `websocketService` or `useLobbyRealTime` to subscribe and
  // pass event payloads into the handlers exported above.

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
