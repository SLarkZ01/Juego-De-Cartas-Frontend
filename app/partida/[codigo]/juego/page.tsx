"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import LobbyHeader from '@/components/lobby/LobbyHeader';
import PlayersList from '@/components/lobby/PlayersList';
import ManoJugador from '@/components/game/ManoJugador';
import Mesa from '@/components/game/Mesa';
import { partidaService } from '@/services/partida.service';
import { gameplayService } from '@/services/partida.service';
import { useLobbyRealTime } from '@/hooks/useLobbyRealTime';
import { readJugadorId, persistJugadorId } from '@/lib/partidaUtils';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import CartaComponent from '@/components/game/CartaComponent';
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

  // DnD sensors must be created at top-level so hook order doesn't change between renders
  const pointerSensor = useSensor(PointerSensor);
  const sensors = useSensors(pointerSensor);

  // Hook WS para lista de jugadores (reutiliza lógica existente)
  const { jugadores: jugadoresLobby, connected, registerSession } = useLobbyRealTime(codigo, jugadorId);

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
        setCartasDB(db);
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
                onDragStart={(event) => {
                  setActiveId(event.active.id as string);
                }}
                onDragOver={(event) => {
                  // opcional: manejar swapping mientras se arrastra
                }}
                onDragEnd={async (event) => {
                  const { active, over } = event;
                  setActiveId(null);
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
