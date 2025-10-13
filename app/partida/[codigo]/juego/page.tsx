"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import LobbyHeader from '@/components/lobby/LobbyHeader';
import PlayersList from '@/components/lobby/PlayersList';
import ManoJugador from '@/components/game/ManoJugador';
import Mesa from '@/components/game/Mesa';
import { partidaService, cartaService } from '@/services/partida.service';
import { gameplayService } from '@/services/partida.service';
import { useLobbyRealTime } from '@/hooks/useLobbyRealTime';
import { useGameData } from '@/hooks/useGameData';
import { readJugadorId, persistJugadorId } from '@/lib/partidaUtils';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import CartaComponent from '@/components/game/CartaComponent';
import { createPortal } from 'react-dom';
import { arrayMove } from '@dnd-kit/sortable';
import Toast from '@/components/ui/Toast';

export default function JuegoPage() {
  const params = useParams();
  const router = useRouter();
  const codigo = params?.codigo as string;

  const [jugadorId, setJugadorId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<any | null>(null);
  const [cartasDB, setCartasDB] = useState<Record<string, any>>({});
  const [toastMessage, setToastMessage] = useState<string>('');
  const [manoOrder, setManoOrder] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastPlayedRef = React.useRef<string | null>(null);
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null);
  // store pointer start, offset and element rect for precise overlay positioning on small screens
  const dragStartPointer = React.useRef<any>(null);
  // pointer tracker to follow actual pointer/touch coordinates during drag (RAF throttled)
  const pointerTrackerRef = React.useRef<{ handler?: any; raf?: number | null }>({ handler: undefined, raf: null });

  // DnD sensors must be created at top-level so hook order doesn't change between renders
  // require a small movement before activating drag to avoid jumps on different screen scalings
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  // Hook WS para lista de jugadores (reutiliza lógica existente)
  const { cartasDB: globalCartasDB, miJugador: miJugadorFromHook, handlers } = useGameData();
  const { jugadores: jugadoresLobby, connected, registerSession } = useLobbyRealTime(codigo, jugadorId, undefined, handlers.onPartidaIniciada, handlers.onCountsMessage);

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

  // cleanup pointer tracker if component unmounts
  useEffect(() => {
    return () => {
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
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // Keep detalle.miJugador.numeroCartas in sync with miJugadorFromHook when counts arrive via WS
  useEffect(() => {
    try {
      if (miJugadorFromHook && miJugadorFromHook.id && detalle && detalle.miJugador && detalle.miJugador.id === miJugadorFromHook.id) {
        setDetalle((prev: any) => ({ ...prev, miJugador: { ...prev.miJugador, numeroCartas: miJugadorFromHook.numeroCartas ?? prev.miJugador.numeroCartas } }));
      }
    } catch (e) {
      // ignore
    }
    // only run when miJugadorFromHook.numeroCartas changes
  }, [miJugadorFromHook?.numeroCartas]);

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
              try { persistJugadorId(codigo, localId); } catch (e) {}
            }
          } catch (reErr) {
            // ignore
            console.warn('[JuegoPage] reconectarPartida falló:', reErr);
          }
        }

        // Ahora solicitar detalle con el jugadorId (si existe)
        const detalleResp = await partidaService.obtenerPartidaDetalle(codigo, localId || '');
        setDetalle(detalleResp);
        // inicializar orden de la mano local desde el detalle
        if (detalleResp && detalleResp.miJugador && Array.isArray(detalleResp.miJugador.cartasEnMano)) {
          setManoOrder(detalleResp.miJugador.cartasEnMano);
        }
        if (detalleResp && detalleResp.jugadorId && (!jugadorId || jugadorId !== detalleResp.jugadorId)) {
          setJugadorId(detalleResp.jugadorId);
          try { persistJugadorId(codigo, detalleResp.jugadorId); } catch (e) {}
        }

  const cartas = await fetch('/api/cartas');
  const cartasJson = cartas.ok ? await cartas.json() : [];
  const db = cartasJson.reduce((acc: any, c: any) => { acc[c.codigo] = c; return acc; }, {});
  // merge with globalCartasDB provided by useGameData (if any)
  const merged = { ...db, ...(globalCartasDB || {}) };
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
            results.forEach((r: any) => {
              if (r.status === 'fulfilled') {
                const payload = r.value;
                if (payload && payload.full) {
                  const code = payload.code;
                  const full = payload.full;
                  setCartasDB((prev) => ({ ...prev, [code]: full }));
                }
              } else {
                // fulfilled rejected promise wrapper (shouldn't happen often)
                try {
                  const payload = r.reason;
                  if (payload && payload.code && payload.err) {
                    console.warn('[JuegoPage] no se pudo traer detalle carta', payload.code, payload.err);
                  }
                } catch (e) {
                  console.warn('[JuegoPage] detalle carta fetch fallo', e);
                }
              }
            });
          }
        }
      } catch (e) {
        console.warn('[JuegoPage] error cargando detalle/cartas', e);
      }
    };

    init();
    // reintentar carga si cambia jugadorId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, jugadorId]);

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
              <PlayersList jugadores={jugadoresLobby as any} partidaTurno={detalle.turnoActual} />
            </aside>

            <main className="lg:col-span-3 space-y-6">
              <DndContext
                sensors={sensors}
                modifiers={[restrictToWindowEdges]}
                onDragStart={(event) => {
                  setActiveId(event.active.id as string);
                  // record pointer start if available and save the dragged element rect
                  try {
                    const act: any = (event as any).activatorEvent;
                    // activatorEvent might be a TouchEvent with touches[0]
                    let clientX = act?.clientX ?? (act?.nativeEvent ? act.nativeEvent.clientX : undefined);
                    let clientY = act?.clientY ?? (act?.nativeEvent ? act.nativeEvent.clientY : undefined);
                    if (!clientX && act?.touches && act.touches[0]) {
                      clientX = act.touches[0].clientX;
                      clientY = act.touches[0].clientY;
                    }
                    if (typeof clientX === 'number' && typeof clientY === 'number') {
                      dragStartPointer.current = { x: clientX, y: clientY };
                      try {
                        const el = document.querySelector(`[data-draggable-id="${event.active.id}"]`) as HTMLElement | null;
                        if (el) {
                          const rect = el.getBoundingClientRect();
                          (dragStartPointer as any).rect = rect;
                          const offsetX = clientX - rect.left;
                          const offsetY = clientY - rect.top;
                          (dragStartPointer as any).currentOffset = { x: offsetX, y: offsetY };
                          // compute overlay position in viewport coordinates (fixed overlay)
                          const x = clientX - offsetX;
                          const y = clientY - offsetY;
                          console.log('[DnD] dragStart', { clientX, clientY, rect, offsetX, offsetY, x, y, dpr: window.devicePixelRatio });
                          setOverlayPos({ x, y });
                          // attach pointer tracker to follow finger/mouse for more reliable moves on touch devices
                          // define handler once and keep it in ref so we can remove it later
                          if (!pointerTrackerRef.current.handler) {
                            const handler = (ev: any) => {
                              // throttle with RAF
                              if (pointerTrackerRef.current.raf != null) return;
                              pointerTrackerRef.current.raf = window.requestAnimationFrame(() => {
                                try {
                                  let px = ev.clientX;
                                  let py = ev.clientY;
                                  if ((!px || !py) && ev.touches && ev.touches[0]) {
                                    px = ev.touches[0].clientX;
                                    py = ev.touches[0].clientY;
                                  }
                                  if (typeof px === 'number' && typeof py === 'number') {
                                    const offset = (dragStartPointer as any).currentOffset;
                                    if (offset) {
                                      const nx = px - offset.x;
                                      const ny = py - offset.y;
                                      setOverlayPos({ x: nx, y: ny });
                                    } else {
                                      setOverlayPos({ x: px, y: py });
                                    }
                                  }
                                } catch (e) {
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
                          console.debug('[DnD] dragStart no element rect', { clientX, clientY });
                          setOverlayPos({ x: clientX, y: clientY });
                        }
                      } catch (e) {
                        console.debug('[DnD] dragStart failed computing rect', e);
                        setOverlayPos({ x: clientX, y: clientY });
                      }
                    }
                  } catch (e) {
                    dragStartPointer.current = null;
                    setOverlayPos(null);
                  }
                }}
                onDragMove={(event) => {
                  try {
                    const delta: any = (event as any).delta;
                    const act: any = (event as any).activatorEvent;
                    // prefer delta if available (more stable), otherwise use activatorEvent coords
                    if (dragStartPointer.current && delta) {
                      // base client coords are start + delta
                      const baseX = dragStartPointer.current.x + (delta.x ?? 0);
                      const baseY = dragStartPointer.current.y + (delta.y ?? 0);
                      const offset = (dragStartPointer as any).currentOffset;
                      if (offset) {
                        const x = baseX - offset.x;
                        const y = baseY - offset.y;
                        // if pointer tracker is active, skip DnD-kit onDragMove updates to avoid conflicts
                        if (pointerTrackerRef.current.handler) return;
                        console.log('[DnD] dragMove delta', { baseX, baseY, offset, x, y });
                        setOverlayPos({ x, y });
                      } else {
                        console.debug('[DnD] dragMove delta no offset', { baseX, baseY });
                        setOverlayPos({ x: baseX, y: baseY });
                      }
                    } else if (act) {
                      let clientX = act?.clientX ?? (act?.nativeEvent ? act.nativeEvent.clientX : undefined);
                      let clientY = act?.clientY ?? (act?.nativeEvent ? act.nativeEvent.clientY : undefined);
                      if (!clientX && act?.touches && act.touches[0]) {
                        clientX = act.touches[0].clientX;
                        clientY = act.touches[0].clientY;
                      }
                      if (typeof clientX === 'number' && typeof clientY === 'number') {
                        const offset = (dragStartPointer as any).currentOffset;
                        if (offset) {
                          const x = clientX - offset.x;
                          const y = clientY - offset.y;
                          if (pointerTrackerRef.current.handler) return;
                          console.log('[DnD] dragMove activator', { clientX, clientY, offset, x, y });
                          setOverlayPos({ x, y });
                        } else {
                          if (pointerTrackerRef.current.handler) return;
                          console.log('[DnD] dragMove activator no offset', { clientX, clientY });
                          setOverlayPos({ x: clientX, y: clientY });
                        }
                      }
                    }
                  } catch (e) {
                    // ignore
                  }
                }}
                onDragEnd={async (event) => {
                  const { active, over } = event;
                  setActiveId(null);
                  setOverlayPos(null);
                  // cleanup pointer tracker listeners
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
                  } catch (e) {
                    // ignore
                  }
                  if (!over) return;

                  // si se soltó sobre otra carta, reordenar
                  if (over.id && active.id && over.id !== 'mesa' && over.id !== active.id) {
                    const oldIndex = manoOrder.indexOf(active.id as string);
                    const newIndex = manoOrder.indexOf(over.id as string);
                    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                      const next = arrayMove(manoOrder, oldIndex, newIndex);
                      setManoOrder(next);
                      // también notificar al backend si se desea persistir la orden
                    }
                    return;
                  }

                  // si se suelta sobre la mesa
                  if (over.id === 'mesa') {
                    const playingId = active.id as string | undefined;
                    if (!playingId) return;
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
                    } catch (e: any) {
                      console.error('[JuegoPage] jugarCarta error', e);
                      setToastMessage(e?.message || 'Error al jugar la carta');
                      // revertir si falla
                      setManoOrder(previousOrder);
                    } finally {
                      // limpiar guardado después de un tiempo corto para permitir nuevas jugadas
                      setTimeout(() => { if (lastPlayedRef.current === playingId) lastPlayedRef.current = null; }, 2000);
                    }
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
                    const fallback = { codigo: activeId, nombre: activeId, atributos: {} } as any;
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
            </DndContext>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
