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
  const dragStartPointer = React.useRef<{ x: number; y: number } | null>(null);

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
                  // record pointer start if available
                  try {
                    const act: any = (event as any).activatorEvent;
                    const clientX = act?.clientX ?? (act?.nativeEvent ? act.nativeEvent.clientX : undefined);
                    const clientY = act?.clientY ?? (act?.nativeEvent ? act.nativeEvent.clientY : undefined);
                    if (typeof clientX === 'number' && typeof clientY === 'number') {
                      dragStartPointer.current = { x: clientX, y: clientY };
                      // compute pointer offset relative to the dragged element's bounding rect
                      try {
                        const el = document.querySelector(`[data-draggable-id="${event.active.id}"]`) as HTMLElement | null;
                        if (el) {
                          const rect = el.getBoundingClientRect();
                          const offsetX = clientX - rect.left;
                          const offsetY = clientY - rect.top;
                          (dragStartPointer as any).currentOffset = { x: offsetX, y: offsetY };
                          setOverlayPos({ x: clientX - offsetX, y: clientY - offsetY });
                        } else {
                          setOverlayPos({ x: clientX, y: clientY });
                        }
                      } catch (e) {
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
                    if (dragStartPointer.current && delta) {
                      const baseX = dragStartPointer.current.x + (delta.x ?? 0);
                      const baseY = dragStartPointer.current.y + (delta.y ?? 0);
                      const offset = (dragStartPointer as any).currentOffset;
                      if (offset) {
                        setOverlayPos({ x: baseX - offset.x, y: baseY - offset.y });
                      } else {
                        setOverlayPos({ x: baseX, y: baseY });
                      }
                    } else {
                      // fallback to activatorEvent coords
                      const act: any = (event as any).activatorEvent;
                      const clientX = act?.clientX ?? (act?.nativeEvent ? act.nativeEvent.clientX : undefined);
                      const clientY = act?.clientY ?? (act?.nativeEvent ? act.nativeEvent.clientY : undefined);
                      if (typeof clientX === 'number' && typeof clientY === 'number') setOverlayPos({ x: clientX, y: clientY });
                    }
                  } catch (e) {
                    // ignore
                  }
                }}
                onDragEnd={async (event) => {
                  const { active, over } = event;
                  setActiveId(null);
                  setOverlayPos(null);
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
              <DragOverlay>
                {activeId ? (
                  (() => {
                    const carta = cartasDB[activeId];
                    const fallback = { codigo: activeId, nombre: activeId, atributos: {} } as any;
                    return <div className="w-40 pointer-events-none z-50"><CartaComponent carta={carta || fallback} /></div>;
                  })()
                ) : null}
              </DragOverlay>
            </DndContext>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
