"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import type { DragMoveEvent } from '@dnd-kit/core';
import { useParams, useRouter } from 'next/navigation';
import LobbyHeader from '@/components/lobby/LobbyHeader';
import PlayersList from '@/components/lobby/PlayersList';
import ManoJugador from '@/components/game/ManoJugador';
import { useReorderHand } from '@/hooks/useReorderHand';
import Mesa from '@/components/game/Mesa';
import { partidaService, cartaService } from '@/services/partida.service';
import { gameplayService } from '@/services/partida.service';
import { useLobbyRealTime } from '@/hooks/useLobbyRealTime';
import { useGameData } from '@/hooks/useGameData';
import useTurnHandler from '@/hooks/useTurnHandler';
import usePartidaPanelSync from '@/hooks/usePartidaPanelSync';
import { readJugadorId, persistJugadorId } from '@/lib/partidaUtils';
import { websocketService } from '@/lib/websocket';
import api from '@/lib/api';
import { AccionWebSocket } from '@/types/api';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import CartaComponent from '@/components/game/CartaComponent';
import { createPortal } from 'react-dom';
import { arrayMove } from '@dnd-kit/sortable';
import Toast from '@/components/ui/Toast';
import type { Carta, PartidaDetailResponse, JugadorPublic } from '@/types/api';

export default function JuegoPage() {
  const params = useParams();
  const router = useRouter();
  const codigo = params?.codigo as string;

  const [jugadorId, setJugadorId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<PartidaDetailResponse | null>(null);
  const [cartasDB, setCartasDB] = useState<Record<string, Carta>>({});
  const [toastMessage, setToastMessage] = useState<string>('');
  // remoteCartas holds incoming CARTA_JUGADA events to ensure all clients render played cards immediately
  const [remoteCartas, setRemoteCartas] = useState<any[]>([]);
  // remoteSelections holds incoming ATRIBUTO_SELECCIONADO events (player chose attribute for a card)
  const [remoteSelections, setRemoteSelections] = useState<Array<{ jugadorId: string; cartaCodigo?: string; atributo?: string; nombreJugador?: string; timestamp?: string }>>([]);

  // Helpers to avoid using `any` in touch/event parsing
  type TouchLike = { length?: number; [index: number]: unknown };
  const getFirstTouch = (touches: unknown): Record<string, unknown> | undefined => {
    if (!touches) return undefined;
    if (Array.isArray(touches) && touches.length > 0) return touches[0] as Record<string, unknown>;
    if (typeof touches === 'object') {
      const t = touches as TouchLike;
      if (typeof t.length === 'number' && t.length > 0) {
        return t[0] as Record<string, unknown>;
      }
    }
    return undefined;
  };

  const getErrorMessage = (err: unknown, fallback = 'Error inesperado'): string => {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (typeof err === 'object' && err !== null) {
      const e = err as Record<string, unknown>;
      if (typeof e.message === 'string') return e.message;
      if (typeof e.error === 'string') return e.error;
    }
    return fallback;
  };
  // useReorderHand: persistencia optimista del orden de la mano
  const {
    hand: manoOrder,
    setHand: setManoOrder,
    applyLocalReorder,
    confirmReorder,
    rollback,
    saving: guardandoOrden
  } = useReorderHand({
    partidaCodigo: codigo,
    initialHand: detalle?.miJugador?.cartasEnMano ?? [],
    onPartidaResponse: (resp) => {
      // Si backend devuelve el nuevo orden, sincronizar
      if (resp && Array.isArray(resp.order)) setManoOrder(resp.order);
    }
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastPlayedRef = React.useRef<string | null>(null);
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null);
  // store pointer start, offset and element rect for precise overlay positioning on small screens
  const dragStartPointer = React.useRef<{ x: number; y: number; rect?: DOMRect; currentOffset?: { x: number; y: number } } | null>(null);
  // pointer tracker to follow actual pointer/touch coordinates during drag (RAF throttled)
  const pointerTrackerRef = React.useRef<{ handler?: (ev: PointerEvent | TouchEvent | MouseEvent) => void; raf?: number | null }>({ handler: undefined, raf: null });

  // DnD sensors must be created at top-level so hook order doesn't change between renders
  // require a small movement before activating drag to avoid jumps on different screen scalings
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  // helper: wait for the element with data-draggable-id to appear/move from startRect
  // Uses a MutationObserver on the document to detect DOM changes and compares bounding rects.
  const waitForElementRectChange = (id: string, startRect: DOMRect | undefined, timeout = 300) => {
    return new Promise<void>((resolve) => {
      if (!id) return resolve();
      let finished = false;
      const resolveNow = () => {
        if (finished) return;
        finished = true;
        try { obs.disconnect(); } catch {}
        try { clearTimeout(timer); } catch {}
        resolve();
      };

      const checkOnce = () => {
        try {
          const el = document.querySelector(`[data-draggable-id="${id}"]`) as HTMLElement | null;
          if (!el) {
            // If element not present, consider it acceptable (it may have been removed when played)
            return resolveNow();
          }
          const rect = el.getBoundingClientRect();
          if (!startRect) return resolveNow();
          const different = Math.abs(rect.left - startRect.left) > 1 || Math.abs(rect.top - startRect.top) > 1 || Math.abs(rect.width - startRect.width) > 1 || Math.abs(rect.height - startRect.height) > 1;
          if (different) return resolveNow();
        } catch {
          return resolveNow();
        }
        return false;
      };

      // immediate check
      try {
        if (checkOnce()) return resolveNow();
      } catch {
        return resolveNow();
      }

      // Observe DOM mutations globally; when a change happens, re-check.
      const obs = new MutationObserver(() => {
        try {
          if (checkOnce()) resolveNow();
        } catch {
          resolveNow();
        }
      });

      try {
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
      } catch {
        // If observation fails for any reason, fallback to resolving after timeout
      }

      // Safety timeout
      const timer = setTimeout(() => {
        resolveNow();
      }, timeout);
    });
  };

  // helper to cleanup pointer tracker and then hide overlay after a short delay
  const clearPointerTrackerAndOverlay = async (delay = 30, waitForId?: string, startRect?: DOMRect | undefined) => {
    try {
      const handler = pointerTrackerRef.current.handler;
      if (handler) {
        window.removeEventListener('pointermove', handler);
        window.removeEventListener('touchmove', handler);
        window.removeEventListener('mousemove', handler);
        pointerTrackerRef.current.handler = undefined;
      }
      if (pointerTrackerRef.current.raf) {
        window.cancelAnimationFrame(pointerTrackerRef.current.raf as number);
        pointerTrackerRef.current.raf = null;
      }
    } catch {
      // ignore
    }

    // if caller provided an id to wait for (reorder), poll until its rect changes or timeout
    if (waitForId) {
      try {
        await waitForElementRectChange(waitForId, startRect, 300);
      } catch {
        // ignore
      }
    }

    // wait a frame (and a small delay) so the reorder can paint and avoid flicker
    window.requestAnimationFrame(() => {
      setTimeout(() => {
        setActiveId(null);
        setOverlayPos(null);
      }, delay);
    });
  };

  // Hook WS para lista de jugadores (reutiliza lógica existente)
  const { cartasDB: globalCartasDB, miJugador: miJugadorFromHook, handlers, cartasEnMesa, resolviendo, atributoSeleccionado, setMiJugador } = useGameData();

  // Create a local handler for partida messages coming from lobby WS that
  // - delegates to the useGameData handler (to keep internal updates)
  // - refreshes the private 'detalle' from the backend when useful (e.g., turno change)
  const lastDetalleFetchRef = React.useRef<number>(0);
  const handlePartidaRef = React.useRef<((p: any) => void) | null>(null);

  const onLobbyPartidaMessage = React.useCallback(async (payload: unknown) => {
    try {
      // let useGameData process the message first (it updates cards DB / mesa etc)
      try { handlers.onPartidaIniciada?.(payload); } catch (e) { console.warn('[JuegoPage] handlers.onPartidaIniciada error', e); }
      // Forward jugadores from payload to the panel sync hook if present so counts update immediately
      try {
        const incoming = payload as Record<string, any>;
        if (setJugadoresPanel && Array.isArray(incoming.jugadores)) {
          try {
            const myIdLocal = detalle?.jugadorId ?? jugadorId ?? undefined;
            setJugadoresPanel(incoming.jugadores.map((j: any) => ({
              id: j.id,
              nombre: j.nombre ?? j.userId ?? String(j.id),
              numeroCartas: typeof j.numeroCartas === 'number' ? j.numeroCartas : 0,
              orden: typeof j.orden === 'number' ? j.orden : 0,
              conectado: !!j.conectado,
            })));
          } catch (e) {
            // ignore mapping errors
          }
        }
      } catch {}

  if (!payload || typeof payload !== 'object') return;
  // also let the players panel hook parse this payload (if exposed)
  try { if (handlePartidaRef.current) handlePartidaRef.current(payload); } catch {}
      const p = payload as Record<string, any>;
      const tipo = String(p.tipo ?? '').toUpperCase();

      // Throttle detalle refreshes: avoid calling obtenerPartidaDetalle more than once
      // every 700ms to prevent flood loops when server re-broadcasts identical PARTIDA_STATE.
      const now = Date.now();
      const timeSinceLast = now - (lastDetalleFetchRef.current || 0);
      const shouldRefreshDetalle = tipo === 'PARTIDA_STATE' || tipo === 'PARTIDA_ESTADO' || tipo === 'RONDA_RESUELTA';

      if (shouldRefreshDetalle && timeSinceLast > 700) {
        lastDetalleFetchRef.current = now;
        const myId = detalle?.jugadorId ?? jugadorId ?? readJugadorId(codigo);
        if (myId) {
          try {
            const nuevo = await partidaService.obtenerPartidaDetalle(codigo, myId);
            if (nuevo) {
              // Only update detalle if it actually differs to avoid render loops
              try {
                const sameMiJugador = detalle && detalle.miJugador && nuevo.miJugador && detalle.miJugador.id === nuevo.miJugador.id && JSON.stringify(detalle.miJugador.cartasEnMano || []) === JSON.stringify(nuevo.miJugador.cartasEnMano || []);
                if (!detalle || !sameMiJugador) {
                  setDetalle(nuevo);
                  try { setMiJugador && setMiJugador(nuevo.miJugador); } catch {}
                }
              } catch (e) {
                setDetalle(nuevo);
                try { setMiJugador && setMiJugador(nuevo.miJugador); } catch {}
              }
            }
          } catch (e) {
            console.warn('[JuegoPage] failed to refresh detalle after PARTIDA_STATE', e);
          }
        }
      } else {
        // light heuristic: if TURN change or carta jugada, we may update some UI but
        // avoid fetching detalle too frequently
        const hasTurno = typeof p.turnoActual === 'string' || (p.partida && typeof p.partida.turnoActual === 'string') || (p.datos && typeof p.datos.turnoActual === 'string');
        const hasJugadorId = typeof p.jugadorId === 'string' || (p.partida && typeof p.partida.jugadorId === 'string');
        if ((hasTurno || hasJugadorId) && now - (lastDetalleFetchRef.current || 0) > 1500) {
          lastDetalleFetchRef.current = now;
          const myId = detalle?.jugadorId ?? jugadorId ?? readJugadorId(codigo);
          if (myId) {
            try {
              const nuevo = await partidaService.obtenerPartidaDetalle(codigo, myId);
              if (nuevo) {
                setDetalle(nuevo);
                try { setMiJugador && setMiJugador(nuevo.miJugador); } catch {}
              }
            } catch (e) {
              console.warn('[JuegoPage] failed to refresh detalle after partida message', e);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[JuegoPage] onLobbyPartidaMessage error', e);
    }
  }, [codigo, detalle, jugadorId, handlers, setMiJugador]);

  // counts handler ref so we can register it with the central WS subscription before the panel handler exists
  const handleCountsRef = React.useRef<((p: any) => void) | null>(null);
  const countsCallback = React.useCallback((payload: Record<string, unknown>) => {
    try { handlers.onCountsMessage?.(payload); } catch {}
    try { if (handleCountsRef.current) handleCountsRef.current(payload); } catch {}
  }, [handlers]);

  const typedHandlers = React.useMemo(() => ({
    onPartidaState: (p: any) => {
      try { handlers.onPartidaIniciada?.(p); } catch {}
      try { if (handlePartidaRef.current) handlePartidaRef.current(p); } catch {}
      // Attempt to reconcile the local detalle / mano when the server includes jugadores snapshot
      try {
        const incoming = p as Record<string, any>;
        const myIdLocal = detalle?.jugadorId ?? jugadorId ?? readJugadorId(codigo);
        if (myIdLocal && Array.isArray(incoming.jugadores)) {
          const me = incoming.jugadores.find((j: any) => String(j.id) === String(myIdLocal) || String((j.userId ?? '')) === String(myIdLocal));
          if (me) {
            // If the server sent the explicit cartasEnMano array, update detalle and manoOrder immediately
            if (Array.isArray(me.cartasEnMano)) {
              try {
                setDetalle((prev) => {
                  const next = prev ? { ...prev } as any : { codigo } as any;
                  next.miJugador = { ...(next.miJugador ?? {}), ...(me ?? {}) };
                  return next;
                });
                // Update local hand order to server-provided order
                try { setManoOrder(me.cartasEnMano); } catch {}
              } catch {}
            } else if (typeof me.numeroCartas === 'number') {
              // If only counts changed, but we don't have cartasEnMano, try a throttled detalle fetch
              try {
                const now = Date.now();
                const last = lastDetalleFetchRef.current || 0;
                if (now - last > 700) {
                  lastDetalleFetchRef.current = now;
                  const myId = String(myIdLocal);
                  partidaService.obtenerPartidaDetalle(codigo, myId).then((nuevo) => {
                    if (nuevo) {
                      setDetalle(nuevo);
                      try { setMiJugador && setMiJugador(nuevo.miJugador); } catch {}
                      if (nuevo.miJugador && Array.isArray(nuevo.miJugador.cartasEnMano)) {
                        try { setManoOrder(nuevo.miJugador.cartasEnMano); } catch {}
                      }
                    }
                  }).catch(() => {});
                }
              } catch {}
            }
          }
        }
      } catch (e) {
        // ignore reconciliation errors
      }
      try {
        // Diagnostic: log decision state after processing PARTIDA_STATE
        try {
          const payload = p as Record<string, any>;
          const myIdLocal = detalle?.jugadorId ?? jugadorId ?? readJugadorId(codigo);
          const playersForLog = (jugadoresPanel && jugadoresPanel.length ? jugadoresPanel : jugadoresLobby) || [];
          const resolved = ((): string => {
            try {
              const raw = (payload?.expectedPlayerId ?? payload?.turnoActual ?? '');
              if (!raw) return '';
              for (const pl of playersForLog) {
                const asAny = pl as any;
                if (String(pl.id) === String(raw) || String(asAny.userId ?? '') === String(raw)) return String(pl.id);
              }
              return String(raw);
            } catch { return '' }
          })();
          const quickCanDrop = Boolean(resolved && myIdLocal && String(resolved) === String(myIdLocal) && (cartasEnMesa && cartasEnMesa.length ? true : (atributoSeleccionado ?? detalle?.atributoSeleccionado)) );
          console.debug('[DEBUG][PARTIDA_STATE] payload.tipo=', payload?.tipo, 'resolvedExpected=', resolved, 'canonicalMyId=', myIdLocal, 'players=', playersForLog.map((x:any)=>({id:x.id, numeroCartas:x.numeroCartas})), 'quickCanDrop=', quickCanDrop);
        } catch (e) {}
      } catch {}
    },
    onCartaJugada: (p: any) => {
      try { handlers.onCartaJugada?.(p); } catch {}
      try {
        // Push to remoteCartas for immediate rendering by Mesa
        try { setRemoteCartas((prev) => [...(prev || []), p]); } catch {}
        // If a selection exists for this played card, remove it
        try {
          const pc = String(p.codigoCarta ?? p.datos?.codigo ?? p.codigo ?? '');
          const pj = String(p.jugadorId ?? p.datos?.jugadorId ?? '');
          setRemoteSelections((prev) => (prev || []).filter(s => !(String(s.cartaCodigo ?? '') === pc && String(s.jugadorId ?? '') === pj)));
        } catch {}
      } catch {}
    },
    onAtributoSeleccionado: (p: any) => {
      try { handlers.onAtributoSeleccionado?.(p); } catch {}
      try {
        // Record remote selection so Mesa can show which attribute was chosen (even before card is played)
        try {
          const sel = {
            jugadorId: String(p.jugadorId ?? p.datos?.jugadorId ?? ''),
            cartaCodigo: String(p.cartaCodigo ?? p.datos?.codigo ?? p.codigo ?? ''),
            atributo: String(p.atributo ?? p.datos?.atributo ?? ''),
            nombreJugador: String(p.nombreJugador ?? p.datos?.nombreJugador ?? p.nombre ?? ''),
            timestamp: String(p.timestamp ?? new Date().toISOString()),
          };
          if (sel.jugadorId) {
            setRemoteSelections((prev) => {
              const copy = (prev || []).filter((x) => !(String(x.jugadorId) === String(sel.jugadorId) && String(x.cartaCodigo ?? '') === String(sel.cartaCodigo ?? '')));
              copy.push(sel);
              return copy;
            });
          }
        } catch {}
      } catch {}
    },
    onTurnoCambiado: (p: any) => {
      try { handlers.onPartidaIniciada?.(p); } catch {}
      try {
        // Diagnostic log for turno cambiado
        const payload = p as Record<string, any>;
        const myIdLocal = detalle?.jugadorId ?? jugadorId ?? readJugadorId(codigo);
        const playersForLog = (jugadoresPanel && jugadoresPanel.length ? jugadoresPanel : jugadoresLobby) || [];
        const expectedRaw = String(payload?.expectedPlayerId ?? payload?.expected ?? payload?.turnoActual ?? '');
        const resolved = ((): string => {
          try {
            if (!expectedRaw) return '';
            for (const pl of playersForLog) {
              const asAny = pl as any;
              if (String(pl.id) === String(expectedRaw) || String(asAny.userId ?? '') === String(expectedRaw)) return String(pl.id);
            }
            return expectedRaw;
          } catch { return expectedRaw }
        })();
        const quickCanDrop = Boolean(resolved && myIdLocal && String(resolved) === String(myIdLocal) && (cartasEnMesa && cartasEnMesa.length ? true : (atributoSeleccionado ?? detalle?.atributoSeleccionado)) );
        console.debug('[DEBUG][TURNO_CAMBIADO] expectedRaw=', expectedRaw, 'resolvedExpected=', resolved, 'canonicalMyId=', myIdLocal, 'players=', playersForLog.map((x:any)=>({id:x.id, numeroCartas:x.numeroCartas})), 'quickCanDrop=', quickCanDrop);
        try {
          if (resolved) {
            try { setTurnoEsperado && setTurnoEsperado(resolved); } catch {}
            // Give a short window to allow the expected player to act immediately
            try {
              if (String(resolved) === String(canonicalMyId)) {
                setForceEnableTurn(true);
                setTimeout(() => setForceEnableTurn(false), 3000);
              }
            } catch {}
          }
        } catch {}
      } catch (e) {}
    },
    onRondaResuelta: (p: any) => {
      try { handlers.onRondaResuelta?.(p); } catch {}
      try {
        // Clear remoteCartas when a round is resolved (they move to winner's deck)
        try { setRemoteCartas([]); } catch {}
        try { setRemoteSelections([]); } catch {}
      } catch {}
    },
  // include relevant deps so memo updates when contexto cambia
  }), [handlers, detalle, jugadorId, codigo, setDetalle, setManoOrder, setMiJugador]);

  const { jugadores: jugadoresLobby, connected, registerSession, client, turnoActual: turnoLobby } = useLobbyRealTime(codigo, jugadorId, undefined, onLobbyPartidaMessage, countsCallback, typedHandlers);

  // Use the low-level client to sync the players panel from PartidaResponse messages (but do not auto-subscribe)
  const { jugadores: jugadoresPanel, setJugadores: setJugadoresPanel, turnoActual: turnoPanel, turnoEsperado, setTurnoEsperado, handlePartidaPayload, handleCountsPayload } = usePartidaPanelSync(client ?? null, codigo, detalle?.jugadorId ?? jugadorId as string | null, { autoSubscribe: false });

  // wire the panel's counts handler into the ref so central countsCallback can forward to it
  React.useEffect(() => {
    handleCountsRef.current = handleCountsPayload ?? null;
    return () => { handleCountsRef.current = null; };
  }, [handleCountsPayload]);

  // wire partida handler to ref so onLobbyPartidaMessage can call it without dependency cycles
  React.useEffect(() => {
    handlePartidaRef.current = handlePartidaPayload ?? null;
    return () => { handlePartidaRef.current = null; };
  }, [handlePartidaPayload]);

  // Prefer the explicit turnoEsperado (TurnoCambiadoEvent), then panel's turno, then lobby stream, then detalle as last resort
  const partidaTurno = (turnoEsperado ?? turnoPanel ?? turnoLobby ?? detalle?.turnoActual) as string | undefined;

  // Turn handler: determine if current player can drop to mesa
  const cartasEnMesaCountFromHandler = Array.isArray(cartasEnMesa) ? cartasEnMesa.length : 0;
  const { expectedPlayerId, canDropToMesa } = useTurnHandler({
    players: (jugadoresPanel && jugadoresPanel.length ? jugadoresPanel : jugadoresLobby) as unknown as { id: string; orden?: number; numeroCartas?: number }[] | undefined,
    turnoActual: partidaTurno,
    cartasEnMesaCount: cartasEnMesaCountFromHandler,
    atributoSeleccionado: atributoSeleccionado ?? detalle?.atributoSeleccionado ?? undefined,
    myPlayerId: detalle?.jugadorId ?? jugadorId,
  });

  // Canonical current player id: prefer detalle, then persisted jugadorId, then hook's miJugador
  const canonicalMyId = String(detalle?.jugadorId ?? jugadorId ?? miJugadorFromHook?.id ?? '');

  // If backend provided an explicit turnoEsperado (TurnoCambiadoEvent), prefer it as authoritative
  const effectiveExpectedRaw = turnoEsperado ?? expectedPlayerId;
  // normalize possible shapes (sometimes we receive an object with expectedPlayerId)
  const effectiveExpectedIdStr = (() => {
    try {
      if (!effectiveExpectedRaw) return '';
      if (typeof effectiveExpectedRaw === 'string') return String(effectiveExpectedRaw);
      if (typeof effectiveExpectedRaw === 'object' && effectiveExpectedRaw !== null) {
        const anyE = effectiveExpectedRaw as Record<string, unknown>;
        return String(anyE.expectedPlayerId ?? anyE.jugadorId ?? anyE.id ?? '');
      }
      return String(effectiveExpectedRaw);
    } catch {
      return '';
    }
  })();

  const effectiveCanDropToMesa = (() => {
    if (effectiveExpectedIdStr) {
      // If the server explicitly says who is expected, use that directly and apply first-play attribute rule
      if (!canonicalMyId) return false;
      if (String(canonicalMyId) !== String(effectiveExpectedIdStr)) return false;
      // first play (cartasEnMesaCount === 0) still requires atributoSeleccionado
      if (cartasEnMesaCountFromHandler === 0 && !(atributoSeleccionado ?? detalle?.atributoSeleccionado)) return false;
      return true;
    }
    // If server didn't provide an expected id, fall back to partidaTurno if available
    try {
      if (partidaTurno && String(partidaTurno) === String(canonicalMyId)) {
        if (cartasEnMesaCountFromHandler === 0 && !(atributoSeleccionado ?? detalle?.atributoSeleccionado)) return false;
        return true;
      }
    } catch {}
    return canDropToMesa;
  })();

  // Resolve expected id into a known jugador.id if possible (match by id or userId)
  const resolvedExpectedId = (() => {
    try {
      const raw = effectiveExpectedIdStr;
      if (!raw) return '';
      const allPlayers = (jugadoresPanel && jugadoresPanel.length ? jugadoresPanel : jugadoresLobby) || [];
      for (const p of allPlayers) {
        const asAny = p as unknown as Record<string, unknown>;
        if (String(p.id) === String(raw) || String(asAny.userId ?? '') === String(raw)) return String(p.id);
      }
      return raw;
    } catch {
      return effectiveExpectedIdStr;
    }
  })();

  // Temporary UI override: when server announces turno change, give a short window to enable interaction
  const [forceEnableTurn, setForceEnableTurn] = useState(false);
  useEffect(() => {
    if (!effectiveExpectedIdStr) return;
    // If panel empty, attempt to refresh detalle so we have local miJugador info
    (async () => {
      try {
        if ((!jugadoresPanel || jugadoresPanel.length === 0) && (detalle?.jugadorId ?? jugadorId)) {
          const myId = detalle?.jugadorId ?? jugadorId ?? '';
          if (myId) {
            const nuevo = await partidaService.obtenerPartidaDetalle(codigo, myId);
            if (nuevo) setDetalle(nuevo);
          }
        }
      } catch (e) {
        // ignore
      }
    })();

    try {
      if (resolvedExpectedId && String(resolvedExpectedId) === String(canonicalMyId)) {
        setForceEnableTurn(true);
        const t = setTimeout(() => setForceEnableTurn(false), 3000);
        return () => clearTimeout(t);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveExpectedIdStr, resolvedExpectedId, codigo]);

  const effectiveCanDropToMesaFinal = effectiveCanDropToMesa || Boolean(forceEnableTurn && String(resolvedExpectedId) === String(canonicalMyId));

  // expose debug via ?debug=1 to help diagnose desyncs in the wild
  const searchParams = useSearchParams();
  const debugMode = Boolean(searchParams?.get('debug'));


  // Subscribe to user-scoped errors so we can surface server rejections and trigger a re-sync
  useEffect(() => {
    if (!client || !detalle?.jugadorId) return;
    let mounted = true;
    try {
      (async () => {
        try {
          await websocketService.subscribeToUserErrors(codigo, (err) => {
            if (!mounted) return;
            try {
              const msg = err?.message ?? 'Error de juego';
              setToastMessage(String(msg));
              // Trigger a resync of detalle to reconcile optimistic state
              (async () => {
                try {
                  const nuevo = await partidaService.obtenerPartidaDetalle(codigo, detalle.jugadorId);
                  if (nuevo) {
                    setDetalle(nuevo);
                    try { setMiJugador && setMiJugador(nuevo.miJugador); } catch {}
                  }
                } catch (e) {
                  console.warn('[JuegoPage] failed to refresh detalle after user error', e);
                }
              })();
            } catch (e) {
              // ignore
            }
          });
        } catch (e) {
          // ignore subscription errors
        }
      })();
    } catch {}

    return () => { mounted = false; };
  }, [client, detalle?.jugadorId, codigo]);

  // Handler: select attribute by clicking the number (Option A)
  // local UI selection state for optimistic feedback
  const [selectedAtributoLocal, setSelectedAtributoLocal] = useState<string | null>(null);
  const [selectedCartaLocal, setSelectedCartaLocal] = useState<string | null>(null);

  const selectAtributo = async (atributo: 'poder' | 'defensa' | 'ki' | 'velocidad', cartaCodigo?: string) => {
    try {
      // Only allow if current client is the expected player
      const myId = String((detalle?.jugadorId ?? jugadorId) || '');
      const serverExpected = effectiveExpectedIdStr ? String(effectiveExpectedIdStr) : '';
      const clientExpected = expectedPlayerId ? String(expectedPlayerId) : '';

      // Determine if selection is allowed:
      // - If server published an expected player, require it to match.
      // - Otherwise fall back to the client-side expectedPlayerId from the hook.
      const isAllowedByServer = serverExpected && myId === serverExpected;
      const isAllowedByClient = !serverExpected && clientExpected && myId === clientExpected;
      if (!isAllowedByServer && !isAllowedByClient) {
        setToastMessage('No puedes seleccionar atributos en este momento');
        return;
      }

      // If this is the first play and no atributo selected yet, ensure the selector is allowed
      if (cartasEnMesaCountFromHandler === 0 && !(atributoSeleccionado ?? detalle?.atributoSeleccionado)) {
        // Only the expected player (handled above) may select; we've already validated that
      }

      // Build action payload and send via websocketService
      const payload = {
        accion: AccionWebSocket.SELECCIONAR_ATRIBUTO,
        jugadorId: myId,
        atributo: atributo,
        cartaCodigo: cartaCodigo,
      } as any;

      // optimistic UI: set local detalle.atributoSeleccionado and local selection markers
      setSelectedAtributoLocal(atributo);
      setSelectedCartaLocal(cartaCodigo ?? null);
      setDetalle((prev) => prev ? { ...prev, atributoSeleccionado: atributo } : prev);

      await websocketService.sendAction(codigo, payload);
      setToastMessage('Atributo enviado');
      // rely on server broadcast (ATRIBUTO_SELECCIONADO) to fully confirm state
    } catch (err) {
      setToastMessage(getErrorMessage(err, 'Error enviando selección'));
      // revert optimistic
      setDetalle((prev) => prev ? { ...prev, atributoSeleccionado: prev?.atributoSeleccionado ?? undefined } : prev);
      setSelectedAtributoLocal(null);
      setSelectedCartaLocal(null);
    }
  };

  // when server broadcasts atributoSeleccionado via useGameData, we should clear the optimistic local state
  useEffect(() => {
    try {
      if (atributoSeleccionado) {
        setSelectedAtributoLocal(String(atributoSeleccionado));
        // server-side event does not always include cartaCodigo; keep selectedCartaLocal as-is
      }
    } catch {}
  }, [atributoSeleccionado]);

  // Evitar re-registrar la sesión varias veces
  const registeredRef = useRef(false);
  // Cuando tengamos jugadorId y estemos conectados al WS, registrar la sesión para que el backend marque conectado=true
  useEffect(() => {
    if (connected && jugadorId && !registeredRef.current) {
      try {
        registerSession(jugadorId);
        registeredRef.current = true;
        console.log('[JuegoPage] registerSession called for', jugadorId);
      } catch (e) {
        console.warn('[JuegoPage] registerSession failed', e);
      }
    }
  }, [connected, jugadorId, registerSession]);

  // Expose current partida codigo globally so useGameData can auto-subscribe (opt-in)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        (window as any).__CURRENT_PARTIDA_CODIGO = codigo;
      }
    } catch {}
    return () => {
      try { if (typeof window !== 'undefined') (window as any).__CURRENT_PARTIDA_CODIGO = undefined; } catch {}
    };
  }, [codigo]);

  // Initialize jugadorId from persisted storage if present
  useEffect(() => {
    try {
  const persisted = readJugadorId(codigo);
      if (persisted && !jugadorId) {
        setJugadorId(persisted);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // cleanup pointer tracker if component unmounts
  useEffect(() => {
    // capture the current ref snapshot to avoid stale-ref warnings in the cleanup
    const snapshot = pointerTrackerRef.current;
    return () => {
      try {
        const currentHandler = snapshot?.handler;
        const currentRaf = snapshot?.raf;
        if (currentHandler) {
          window.removeEventListener('pointermove', currentHandler as EventListener);
          window.removeEventListener('touchmove', currentHandler as EventListener);
          window.removeEventListener('mousemove', currentHandler as EventListener);
          // clear the shared ref
          if (snapshot) snapshot.handler = undefined;
        }
        if (currentRaf) {
          window.cancelAnimationFrame(currentRaf as number);
          if (snapshot) snapshot.raf = null;
        }
      } catch {
        // ignore
      }
    };
  }, []);

  // NOTE: The sync between counts (miJugadorFromHook) and detalle.miJugador is handled
  // via the websocket handlers and explicit detalle fetches. Removing the inline effect
  // avoids dependency-size/runtime errors and update loops in dev mode.

  useEffect(() => {
    // Intentar recuperar jugadorId de localStorage o reconectar antes de solicitar detalle privado
    const init = async () => {
      try {
        let localId = undefined;
        try {
          localId = readJugadorId(codigo);
          if (localId) setJugadorId(localId);
        } catch (e) {
          console.warn('[JuegoPage] no se pudo leer jugadorId de localStorage:', e);
        }

        if (!localId) {
          try {
            const recon = await partidaService.reconectarPartida(codigo);
            if (recon && recon.jugadorId) {
              localId = recon.jugadorId;
              setJugadorId(localId);
              try { persistJugadorId(codigo, localId); } catch { }
            }
          } catch (reErr) {
            // ignore
            console.warn('[JuegoPage] reconectarPartida falló:', reErr);
          }
        }

        // Ahora solicitar detalle con el jugadorId (si existe)
        const detalleResp = await partidaService.obtenerPartidaDetalle(codigo, localId || '');
        setDetalle(detalleResp);
        // inicializar orden de la mano local desde el detalle SOLO si el hook no tiene orden
        if (detalleResp && detalleResp.miJugador && Array.isArray(detalleResp.miJugador.cartasEnMano)) {
          if (!manoOrder || manoOrder.length === 0) setManoOrder(detalleResp.miJugador.cartasEnMano);
        }
        if (detalleResp && detalleResp.jugadorId && (!jugadorId || jugadorId !== detalleResp.jugadorId)) {
          setJugadorId(detalleResp.jugadorId);
          try { persistJugadorId(codigo, detalleResp.jugadorId); } catch { }
        }

  let db: Record<string, Carta> = {};
  try {
    const res = await api.get('/api/cartas');
    const cartasJsonRaw = res && res.data ? res.data : [];
    if (Array.isArray(cartasJsonRaw)) {
      const cartasJson = cartasJsonRaw as Carta[];
      db = cartasJson.reduce((acc: Record<string, Carta>, c) => { acc[c.codigo] = c; return acc; }, {});
    }
  } catch (e) {
    console.warn('[JuegoPage] failed to fetch cartas via api', e);
  }
  // merge with globalCartasDB provided by useGameData (if any)
  const merged = { ...db, ...(globalCartasDB || {}) } as Record<string, Carta>;
  setCartasDB(merged);

        // Si las cartas en mano existen y no tienen atributos en el DB general, traer detalles por código
        if (detalleResp && detalleResp.miJugador && Array.isArray(detalleResp.miJugador.cartasEnMano)) {
          const missingCodes = detalleResp.miJugador.cartasEnMano.filter((code: string) => {
            const entry = db[code];
            return !entry || !entry.atributos || Object.keys(entry.atributos).length === 0;
          });

          if (missingCodes.length > 0) {
            // Parallel fetch with Promise.allSettled to avoid failing the whole batch
            const promises = missingCodes.map((code: string) =>
              cartaService.obtenerCartaPorCodigo(code).then((full) => ({ code, full })).catch((err) => ({ code, err }))
            );

            const results = await Promise.allSettled(promises);
            results.forEach((r) => {
              if (r.status === 'fulfilled') {
                const payload = (r as PromiseFulfilledResult<{ code: string; full?: Carta; err?: unknown }>).value;
                if (payload && payload.full) {
                  const code = payload.code;
                  const full = payload.full as Carta;
                  setCartasDB((prev) => ({ ...prev, [code]: full }));
                }
              } else {
                // fulfilled rejected promise wrapper (shouldn't happen often)
                try {
                  const payload = (r as PromiseRejectedResult).reason as unknown;
                  if (payload && typeof payload === 'object') {
                    const obj = payload as Record<string, unknown>;
                    const code = typeof obj.code === 'string' ? obj.code : undefined;
                    const err = obj.err;
                    if (code) {
                      console.warn('[JuegoPage] no se pudo traer detalle carta', code, err);
                    }
                  }
                } catch {
                  console.warn('[JuegoPage] detalle carta fetch fallo');
                }
              }
            });
          }
        }
      } catch (err) {
        console.warn('[JuegoPage] error cargando detalle/cartas', err);
      }
    };

    init();
    // reintentar carga si cambia jugadorId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, jugadorId]);

  // Suscribir a errores dirigidos al usuario via WebSocketService
  useEffect(() => {
    if (!codigo) return;
    let mounted = true;
    try {
      websocketService.subscribeToUserErrors(codigo, (err) => {
        if (!mounted) return;
        const message = err?.message || 'Error del servidor';
        setToastMessage(String(message));
        // On server error, try to re-sync detalle to recover UI
        try {
          const myId = detalle?.jugadorId ?? jugadorId;
          if (myId) {
            partidaService.obtenerPartidaDetalle(codigo, myId).then((nuevo) => {
              setDetalle(nuevo);
            }).catch(() => {});
          }
        } catch {}
      }).catch((e) => console.warn('[JuegoPage] subscribeToUserErrors failed', e));
    } catch (e) {
      console.warn('[JuegoPage] subscribeToUserErrors threw', e);
    }

    return () => {
      mounted = false;
      try { websocketService.unsubscribeUserErrors(codigo); } catch (e) { /* ignore */ }
    };
  }, [codigo]);

  // Propagar cambios en miJugador.numeroCartas al panel de jugadores para mantener conteos en tiempo real
  useEffect(() => {
    try {
      if (!setJugadoresPanel || !miJugadorFromHook) return;
      // Update only if jugadoresPanel has an entry for miJugador
      setJugadoresPanel((prev) => {
        if (!prev || prev.length === 0) return prev;
  const map = prev.map((p) => ({ ...p }));
        let changed = false;
        for (const p of map) {
          try {
            if (String(p.id) === String(miJugadorFromHook.id)) {
              const newCount = typeof miJugadorFromHook.numeroCartas === 'number' ? miJugadorFromHook.numeroCartas : p.numeroCartas;
              if (p.numeroCartas !== newCount) {
                p.numeroCartas = newCount;
                changed = true;
              }
            }
          } catch {}
        }
        return changed ? (map as any) : prev;
      });
    } catch (e) {
      // ignore
    }
  }, [miJugadorFromHook, setJugadoresPanel]);

  // Si no hay detalle, mostrar loading
  if (!detalle) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <p className="text-white">Cargando partida...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[url('/images/fondo.webp')] bg-cover bg-center">
      <div className="backdrop-blur-sm bg-black/50 min-h-screen">
        <div className="max-w-7xl mx-auto p-4">
          <LobbyHeader codigo={codigo} estado={detalle.estado || 'EN_CURSO'} visualConectado={connected} onSalir={() => router.push('/jugar')} />

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
            {debugMode ? (
              <div className="col-span-full mb-2">
                <div className="p-2 bg-black/60 border border-yellow-500 text-sm text-yellow-200 rounded">
                  <div><strong>DEBUG</strong></div>
                  <div>canonicalMyId: {canonicalMyId}</div>
                    <div>effectiveExpectedId: {effectiveExpectedIdStr}</div>
                    <div>effectiveCanDropToMesaFinal: {String(effectiveCanDropToMesaFinal)}</div>
                    <div>resolvedExpectedId: {String(resolvedExpectedId)}</div>
                  <div>partidaTurno: {String(partidaTurno)}</div>
                  <div>turnoEsperado (raw): {String(turnoEsperado ?? '')}</div>
                  <div>jugadoresPanel: {JSON.stringify((jugadoresPanel || []).map(j => ({ id: j.id, userId: (j as any).userId, nombre: j.nombre, numeroCartas: j.numeroCartas })))}</div>
                </div>
              </div>
            ) : null}
            <aside className="lg:col-span-1">
              {(() => {
                const base = (jugadoresPanel && jugadoresPanel.length ? jugadoresPanel : jugadoresLobby) as unknown as any[];
                const myIdLocal = detalle?.jugadorId ?? jugadorId ?? null;
                const playersForUI = base.map((p) => ({ ...p, isMe: p.isMe ?? (myIdLocal ? String(p.id) === String(myIdLocal) : false) }));
                return <PlayersList key={effectiveExpectedIdStr || 'players'} jugadores={playersForUI as JugadorPublic[]} partidaTurno={partidaTurno} />;
              })()}
            </aside>

            <main className="lg:col-span-3 space-y-6">
              <DndContext
                sensors={sensors}
                modifiers={[restrictToWindowEdges]}
                onDragStart={(event) => {
                  if (resolviendo) return;
                  setActiveId(event.active.id as string);
                  // record pointer start if available and save the dragged element rect
                    try {
                    const act = (event as unknown as { activatorEvent?: unknown }).activatorEvent as unknown;
                    // activatorEvent might be a TouchEvent with touches[0]
                    const anyAct = act as Record<string, unknown>;
                    let clientX = (anyAct.clientX as number | undefined) ?? (anyAct.nativeEvent ? ((anyAct.nativeEvent as unknown) as { clientX?: number }).clientX : undefined);
                    let clientY = (anyAct.clientY as number | undefined) ?? (anyAct.nativeEvent ? ((anyAct.nativeEvent as unknown) as { clientY?: number }).clientY : undefined);
                    if ((clientX === undefined || clientY === undefined) && anyAct.touches) {
                      const first = getFirstTouch(anyAct.touches as unknown);
                      if (first) {
                        clientX = first.clientX as number | undefined;
                        clientY = first.clientY as number | undefined;
                      }
                    }
                    if (typeof clientX === 'number' && typeof clientY === 'number') {
                      dragStartPointer.current = { x: clientX, y: clientY };
                        try {
                          const el = document.querySelector(`[data-draggable-id="${event.active.id}"]`) as HTMLElement | null;
                          if (el && dragStartPointer.current) {
                            const rect = el.getBoundingClientRect();
                            dragStartPointer.current.rect = rect;
                            const offsetX = clientX - rect.left;
                            const offsetY = clientY - rect.top;
                            dragStartPointer.current.currentOffset = { x: offsetX, y: offsetY };
                          // compute overlay position in viewport coordinates (fixed overlay)
                          const x = clientX - offsetX;
                          const y = clientY - offsetY;
                          // debug log removed in production
                          setOverlayPos({ x, y });
                          // attach pointer tracker to follow finger/mouse for more reliable moves on touch devices
                          // define handler once and keep it in ref so we can remove it later
                          if (!pointerTrackerRef.current.handler) {
                            const handler = (ev: PointerEvent | TouchEvent | MouseEvent) => {
                              // throttle with RAF
                              if (pointerTrackerRef.current.raf != null) return;
                              pointerTrackerRef.current.raf = window.requestAnimationFrame(() => {
                                try {
                                  let px: number | undefined = undefined;
                                  let py: number | undefined = undefined;
                                  if ('clientX' in ev && typeof (ev as PointerEvent).clientX === 'number') {
                                    px = (ev as PointerEvent).clientX;
                                    py = (ev as PointerEvent).clientY;
                                  } else if ('touches' in ev && (ev as TouchEvent).touches && (ev as TouchEvent).touches[0]) {
                                    px = (ev as TouchEvent).touches[0].clientX;
                                    py = (ev as TouchEvent).touches[0].clientY;
                                  }
                                  if (typeof px === 'number' && typeof py === 'number') {
                                    const offset = dragStartPointer.current?.currentOffset;
                                    if (offset) {
                                      const nx = px - offset.x;
                                      const ny = py - offset.y;
                                      setOverlayPos({ x: nx, y: ny });
                                    } else {
                                      setOverlayPos({ x: px, y: py });
                                    }
                                  }
                                } catch {
                                  // ignore
                                } finally {
                                  pointerTrackerRef.current.raf = null;
                                }
                              });
                            };
                            pointerTrackerRef.current.handler = handler;
                            // listen to multiple move events for cross-browser coverage
                            window.addEventListener('pointermove', handler, { passive: true });
                            window.addEventListener('touchmove', handler, { passive: true });
                            window.addEventListener('mousemove', handler, { passive: true });
                          }
                        } else {
                          setOverlayPos({ x: clientX, y: clientY });
                        }
                      } catch {
                          setOverlayPos({ x: clientX, y: clientY });
                        }
                    }
                    } catch {
                    dragStartPointer.current = null;
                    setOverlayPos(null);
                  }
                }}
                onDragMove={(event) => {
                    try {
                    const delta = (event as DragMoveEvent).delta as { x?: number; y?: number } | undefined;
                    const act = (event as unknown as { activatorEvent?: unknown }).activatorEvent as unknown;
                    // prefer delta if available (more stable), otherwise use activatorEvent coords
                    if (dragStartPointer.current && delta) {
                      // base client coords are start + delta
                      const baseX = dragStartPointer.current.x + (delta.x ?? 0);
                      const baseY = dragStartPointer.current.y + (delta.y ?? 0);
                      const offset = dragStartPointer.current?.currentOffset;
                      if (offset) {
                        const x = baseX - offset.x;
                        const y = baseY - offset.y;
                        // if pointer tracker is active, skip DnD-kit onDragMove updates to avoid conflicts
                        if (pointerTrackerRef.current.handler) return;
                        setOverlayPos({ x, y });
                      } else {
                        setOverlayPos({ x: baseX, y: baseY });
                      }
                    } else if (act) {
                      // safe extraction of client coordinates from an unknown activator event
                      const getClientCoords = (ev: unknown): { clientX?: number; clientY?: number } => {
                        try {
                          if (!ev || typeof ev !== 'object') return {};
                          const obj = ev as Record<string, unknown>;
                          // Direct properties
                          if (typeof obj.clientX === 'number' && typeof obj.clientY === 'number') {
                            return { clientX: obj.clientX as number, clientY: obj.clientY as number };
                          }
                          // nativeEvent wrapper
                          if (obj.nativeEvent && typeof obj.nativeEvent === 'object') {
                            const ne = obj.nativeEvent as Record<string, unknown>;
                            if (typeof ne.clientX === 'number' && typeof ne.clientY === 'number') {
                              return { clientX: ne.clientX as number, clientY: ne.clientY as number };
                            }
                          }
                          // touches (TouchEvent-like)
                          if (Array.isArray(obj.touches) && obj.touches.length > 0) {
                            const t0 = obj.touches[0] as Record<string, unknown> | undefined;
                            if (t0 && typeof t0.clientX === 'number' && typeof t0.clientY === 'number') {
                              return { clientX: t0.clientX as number, clientY: t0.clientY as number };
                            }
                          }
                          // fallback for TouchList-like (object with item(0))
                          if (obj.touches && typeof obj.touches === 'object') {
                            const first = getFirstTouch(obj.touches as unknown);
                            if (first && typeof first.clientX === 'number' && typeof first.clientY === 'number') {
                              return { clientX: first.clientX as number, clientY: first.clientY as number };
                            }
                          }
                        } catch {
                          // intentionally ignore extraction errors
                        }
                        return {};
                      };

                      const { clientX, clientY } = getClientCoords(act);
                      if (typeof clientX === 'number' && typeof clientY === 'number') {
                        const offset = dragStartPointer.current?.currentOffset;
                        if (offset) {
                          const x = clientX - offset.x;
                          const y = clientY - offset.y;
                          if (pointerTrackerRef.current.handler) return;
                          setOverlayPos({ x, y });
                        } else {
                          if (pointerTrackerRef.current.handler) return;
                          setOverlayPos({ x: clientX, y: clientY });
                        }
                      }
                    }
                  } catch {
                    // ignore
                  }
                }}
                onDragCancel={() => {
                  // Ensure overlay is cleared when a drag is cancelled (e.g., escape, context loss)
                  try {
                    clearPointerTrackerAndOverlay(0);
                  } catch {
                    setActiveId(null);
                    setOverlayPos(null);
                  }
                }}
                onDragEnd={async (event) => {
                  if (resolviendo) {
                    // ignore drops while resolving
                    try { await clearPointerTrackerAndOverlay(0); } catch { setActiveId(null); setOverlayPos(null); }
                    return;
                  }
                  const { active, over } = event;

                  // If drag was cancelled (no drop target), clear overlay immediately
                  if (!over) {
                    await clearPointerTrackerAndOverlay(0);
                    return;
                  }

                  // si se soltó sobre otra carta, reordenar
                  if (over.id && active.id && over.id !== 'mesa' && over.id !== active.id) {
                    // read target element rect BEFORE mutating the DOM so the helper can detect the movement
                    let targetRect: DOMRect | undefined = undefined;
                    try {
                      const targetEl = document.querySelector(`[data-draggable-id="${String(over.id)}"]`) as HTMLElement | null;
                      if (targetEl) targetRect = targetEl.getBoundingClientRect();
                    } catch {
                      // ignore
                    }

                    const oldIndex = manoOrder.indexOf(active.id as string);
                    const newIndex = manoOrder.indexOf(over.id as string);
                    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                      const next = arrayMove(manoOrder, oldIndex, newIndex);
                      // UI optimista: aplica localmente
                      applyLocalReorder(next);
                      // Persistir en backend (debounced si se desea, aquí inmediato)
                      try {
                        await confirmReorder(next);
                      } catch (err) {
                        rollback();
                        setToastMessage(getErrorMessage(err, 'No se pudo guardar el orden de la mano.'));
                      }
                    }

                    // allow a short moment for the DOM reorder to paint, then clear overlay to avoid flicker
                    // pass the id we waited for and the targetRect we captured before DOM mutation so the helper can detect when it moved
                    const startRect = targetRect ?? dragStartPointer.current?.rect;
                    await clearPointerTrackerAndOverlay(50, over.id as string, startRect as DOMRect | undefined);
                    return;
                  }

                  // si se suelta sobre la mesa
                  if (over.id === 'mesa') {
                    const playingId = active.id as string | undefined;
                    if (!playingId) return;

          // Enforce turn rules: only allow dropping to mesa if canDropToMesaFinal
          if (!effectiveCanDropToMesaFinal) {
            const myId = String((detalle?.jugadorId ?? jugadorId) || '');
            const expected = resolvedExpectedId ? String(resolvedExpectedId) : '';
                      // Diagnostic log to help debug why the UI blocks a play
                      try {
                        console.debug('[JuegoPage][debug] canDropToMesa=false', {
                              myId,
                              expectedFromHandler: expected,
                          partidaTurno,
                          turnoEsperado,
                          detalleJugadorId: detalle?.jugadorId,
                          estadoJugadorId: jugadorId,
                              expectedPlayerIdFromHook: expectedPlayerId,
                          jugadoresPanel: jugadoresPanel?.map((j) => ({ id: j.id, numeroCartas: j.numeroCartas, orden: j.orden, userId: (j as any).userId })) ,
                          jugadoresLobby: jugadoresLobby?.map((j) => ({ id: j.id, numeroCartas: j.numeroCartas, orden: j.orden, userId: (j as any).userId })),
                          cartasEnMesaCountFromHandler,
                          atributoSeleccionadoLocal: atributoSeleccionado ?? detalle?.atributoSeleccionado,
                        });
                      } catch (e) {
                        // ignore logging errors
                      }
                      // If it's not your turn, always inform that first
                      if (!expected || myId !== expected) {
                        setToastMessage('No es tu turno para jugar en la mesa');
                      } else if (cartasEnMesaCountFromHandler === 0 && !(atributoSeleccionado ?? detalle?.atributoSeleccionado)) {
                        // Only the expected player should be prompted to select the attribute
                        setToastMessage('Debes seleccionar un atributo antes de jugar la primera carta.');
                      } else {
                        setToastMessage('No puedes jugar en este momento');
                      }
                      // Ensure overlay and active state cleared
                      try {
                        await clearPointerTrackerAndOverlay(0);
                      } catch {
                        setActiveId(null);
                        setOverlayPos(null);
                      }
                      return;
                    }

                    // evitar llamadas duplicadas por movimientos bruscos
                    if (lastPlayedRef.current === playingId) return;
                    lastPlayedRef.current = playingId;
                    // eliminación optimista local: quitar la carta de la mano para que no permanezca visualmente
                    const previousOrder = manoOrder;
                    // compute index in current visual hand before mutating
                    const cardIndex = previousOrder.indexOf(playingId);
                    setManoOrder((prev) => prev.filter((c) => c !== playingId));
                    try {
                      // Primero, intentar publicar un PlayerDragEvent con `cardIndex` si el cliente STOMP existe
                      let dragPublished = false;
                      try {
                        if (client && (client as any).active) {
                          const playerName = detalle?.miJugador?.nombre ?? undefined;
                          const eventPayload = {
                            jugadorId: detalle.jugadorId,
                            jugadorNombre: playerName,
                            dragging: false,
                            cardIndex: cardIndex >= 0 ? cardIndex : undefined,
                            target: 'mesa',
                          } as Record<string, unknown>;
                          (client as any).publish({
                            destination: `/app/partida/${codigo}/drag`,
                            body: JSON.stringify(eventPayload),
                            skipContentLengthHeader: true,
                          });
                          dragPublished = true;
                          setToastMessage('Carta jugada (drag WS)');
                        }
                      } catch (pubErr) {
                        console.warn('[JuegoPage] publicar drag WS falló:', pubErr);
                        dragPublished = false;
                      }

                      if (!dragPublished) {
                        // Si no se publicó el evento drag, intentar la acción JUGAR_CARTA por WS (incluyendo codigo)
                        if (websocketService.isConnected()) {
                          try {
                            websocketService.sendAction(codigo, {
                              accion: AccionWebSocket.JUGAR_CARTA,
                              jugadorId: detalle.jugadorId,
                              codigo: playingId,
                            } as any);
                            setToastMessage('Carta jugada (WS action)');
                          } catch (wsErr) {
                            console.warn('[JuegoPage] sendAction JUGAR_CARTA falló, usando REST fallback', wsErr);
                            await gameplayService.jugarCarta(codigo, { jugadorId: detalle.jugadorId });
                            setToastMessage('Carta jugada (REST)');
                          }
                        } else {
                          console.warn('[JuegoPage] WS no conectado — usando REST fallback que puede jugar otra carta');
                          setToastMessage('Conexión en tiempo real no disponible — la carta jugada puede no ser la seleccionada');
                          await gameplayService.jugarCarta(codigo, { jugadorId: detalle.jugadorId });
                        }
                      }

                      // REFRESCAR detalle desde servidor para sincronizar número de cartas y mano
                      const nuevoDetalle = await partidaService.obtenerPartidaDetalle(codigo, detalle.jugadorId);
                      setDetalle(nuevoDetalle);
                      if (nuevoDetalle && nuevoDetalle.miJugador && Array.isArray(nuevoDetalle.miJugador.cartasEnMano)) {
                        setManoOrder(nuevoDetalle.miJugador.cartasEnMano);
                      }
                    } catch (err: unknown) {
                      console.error('[JuegoPage] jugarCarta error', err);
                      setToastMessage(getErrorMessage(err, 'Error al jugar la carta'));
                      // revertir si falla
                      setManoOrder(previousOrder);
                    } finally {
                      // limpiar guardado después de un tiempo corto para permitir nuevas jugadas
                      setTimeout(() => { if (lastPlayedRef.current === playingId) lastPlayedRef.current = null; }, 2000);
                      // clear overlay after the play flow settles to avoid flicker when the card is removed
                      // If the card was removed from DOM (played), wait for the new mano layout to reflect
                      const startRect = dragStartPointer.current?.rect as DOMRect | undefined;
                        await clearPointerTrackerAndOverlay(50, playingId, startRect);
                    }
                  }
                    // Ensure overlay is cleared in the default case (e.g., dropped back on the same card)
                    try {
                      await clearPointerTrackerAndOverlay(0);
                    } catch {
                      setActiveId(null);
                      setOverlayPos(null);
                    }
                }}
              >
                <div className="bg-black/80 p-6 rounded-lg border border-orange-500/30">
                  <h2 className="text-xl font-bold text-orange-500">Mesa</h2>
                  <Mesa className="mt-4" jugadores={(jugadoresPanel && jugadoresPanel.length ? jugadoresPanel : jugadoresLobby)} selectedAtributo={atributoSeleccionado ?? detalle?.atributoSeleccionado ?? null} selectedCartaCodigo={selectedCartaLocal ?? null} extraCartas={remoteCartas} selections={remoteSelections} />
                </div>

                <div className="bg-black/80 p-4 rounded-lg border border-orange-500/30">
                  <h3 className="text-lg text-white mb-2">Mi Mano</h3>
                      { detalle.miJugador && Array.isArray(detalle.miJugador.cartasEnMano) ? (
                    <ManoJugador
                      cartasCodigos={manoOrder.length ? manoOrder : detalle.miJugador.cartasEnMano}
                      cartasDB={cartasDB}
                      numeroCartas={typeof detalle.miJugador.numeroCartas === 'number' ? detalle.miJugador.numeroCartas : miJugadorFromHook?.numeroCartas}
                      externalDnd
                      controlledOrder={manoOrder.length ? manoOrder : detalle.miJugador.cartasEnMano}
                      onOrderChange={(newOrder) => { setManoOrder(newOrder); }}
                      onSelectAtributo={selectAtributo}
                      canSelectAtributo={(() => {
                        try {
                          const my = String(canonicalMyId);
                          if (!my) return false;
                          // If server provided expected, prefer it (compare both raw and resolved id)
                          if (effectiveExpectedIdStr) {
                            if (String(effectiveExpectedIdStr) === my) return true;
                            if (String(resolvedExpectedId) === my) return true;
                            return false;
                          }
                          // fall back to client-calculated expectedPlayerId
                          if (expectedPlayerId && String(expectedPlayerId) === my) return true;
                          return false;
                        } catch {
                          return false;
                        }
                      })()}
                      selectedAtributo={selectedAtributoLocal}
                      selectedCartaCodigo={selectedCartaLocal}
                    />
                  ) : (
                    <div className="text-sm text-gray-300">Esperando asignación de jugador... Por favor, asegúrate de estar registrado en la partida.</div>
                  )}
                </div>
              {/* Drag overlay muestra la carta mientras se arrastra fuera del flujo normal */}
              {/* Keep a DragOverlay for dnd-kit internals but render a portal overlay positioned using overlayPos
                  to avoid clipping/transform issues on small screens. */}
              <DragOverlay />

              {activeId && overlayPos && typeof document !== 'undefined' ? (
                createPortal(
                  (() => {
                    const carta = cartasDB[activeId];
                    const fallback: Carta = { codigo: activeId, nombre: String(activeId), atributos: {} } as Carta;
                    // use saved bounding rect if available so overlay size matches the original
                    const rect = dragStartPointer.current?.rect as DOMRect | undefined;
                    const width = rect?.width ?? 160;
                    const height = rect?.height ?? (width * 1.5);
                    return (
                      <div style={{ position: 'fixed', left: overlayPos.x, top: overlayPos.y, width, height, pointerEvents: 'none', zIndex: 9999 }}>
                        <div className="w-full h-full pointer-events-none">
                    <CartaComponent carta={carta || fallback} onSelectAtributo={selectAtributo} canSelect={Boolean(effectiveCanDropToMesaFinal && String(resolvedExpectedId) === String(canonicalMyId))} />
                        </div>
                      </div>
                    );
                  })(),
                  document.body
                )
              ) : null}
              <Toast message={toastMessage} open={Boolean(toastMessage)} onClose={() => setToastMessage('')} />
            </DndContext>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
