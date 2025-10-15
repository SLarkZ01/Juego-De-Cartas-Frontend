"use client";

import React, { useEffect, useState, useRef } from 'react';
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
import { readJugadorId, persistJugadorId } from '@/lib/partidaUtils';
import { websocketService } from '@/lib/websocket';
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
  const { cartasDB: globalCartasDB, miJugador: miJugadorFromHook, handlers, cartasEnMesa, resolviendo, atributoSeleccionado } = useGameData();
  const { jugadores: jugadoresLobby, connected, registerSession } = useLobbyRealTime(codigo, jugadorId, undefined, handlers.onPartidaIniciada, handlers.onCountsMessage);

  // Turn handler: determine if current player can drop to mesa
  const cartasEnMesaCountFromHandler = Array.isArray(cartasEnMesa) ? cartasEnMesa.length : 0;
  const { expectedPlayerId, canDropToMesa } = useTurnHandler({
    players: jugadoresLobby as unknown as { id: string; orden?: number; numeroCartas?: number }[] | undefined,
    turnoActual: detalle?.turnoActual,
    cartasEnMesaCount: cartasEnMesaCountFromHandler,
    atributoSeleccionado: atributoSeleccionado ?? detalle?.atributoSeleccionado ?? undefined,
    myPlayerId: detalle?.jugadorId ?? jugadorId,
  });

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

  // Keep detalle.miJugador.numeroCartas in sync with miJugadorFromHook when counts arrive via WS
  useEffect(() => {
    try {
      if (
        miJugadorFromHook &&
        miJugadorFromHook.id &&
        detalle &&
        detalle.miJugador &&
        detalle.miJugador.id === miJugadorFromHook.id
      ) {
        setDetalle((prev) =>
          prev
            ? { ...prev, miJugador: { ...prev.miJugador, numeroCartas: miJugadorFromHook.numeroCartas ?? prev.miJugador.numeroCartas } }
            : prev
        );
      }
    } catch {
      // ignore
    }
    // only run when miJugadorFromHook.numeroCartas changes — include detalle and miJugadorFromHook to satisfy lint (effect is guarded)
    }, [miJugadorFromHook?.numeroCartas, detalle, miJugadorFromHook]);

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

  const cartas = await fetch('/api/cartas');
  const cartasJsonRaw: unknown = cartas.ok ? await cartas.json() : [];
  let db: Record<string, Carta> = {};
  if (Array.isArray(cartasJsonRaw)) {
    const cartasJson = cartasJsonRaw as Carta[];
    db = cartasJson.reduce((acc: Record<string, Carta>, c) => { acc[c.codigo] = c; return acc; }, {});
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
      }).catch((e) => console.warn('[JuegoPage] subscribeToUserErrors failed', e));
    } catch (e) {
      console.warn('[JuegoPage] subscribeToUserErrors threw', e);
    }

    return () => {
      mounted = false;
      try { websocketService.unsubscribeUserErrors(codigo); } catch (e) { /* ignore */ }
    };
  }, [codigo]);

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
            <aside className="lg:col-span-1">
              <PlayersList jugadores={jugadoresLobby as unknown as JugadorPublic[]} partidaTurno={detalle.turnoActual} />
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

                    // Enforce turn rules: only allow dropping to mesa if canDropToMesa
                    if (!canDropToMesa) {
                      const myId = String((detalle?.jugadorId ?? jugadorId) || '');
                      const expected = expectedPlayerId ? String(expectedPlayerId) : '';
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
                    setManoOrder((prev) => prev.filter((c) => c !== playingId));
                    try {
                      await gameplayService.jugarCarta(codigo, { jugadorId: detalle.jugadorId });
                      setToastMessage('Carta jugada');
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
                  <Mesa className="mt-4" />
                </div>

                <div className="bg-black/80 p-4 rounded-lg border border-orange-500/30">
                  <h3 className="text-lg text-white mb-2">Mi Mano</h3>
                  {detalle.miJugador && Array.isArray(detalle.miJugador.cartasEnMano) ? (
                    <ManoJugador cartasCodigos={manoOrder.length ? manoOrder : detalle.miJugador.cartasEnMano} cartasDB={cartasDB} externalDnd controlledOrder={manoOrder.length ? manoOrder : detalle.miJugador.cartasEnMano} onOrderChange={(newOrder) => { setManoOrder(newOrder); }} />
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
                          <CartaComponent carta={carta || fallback} />
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
