"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import LobbyHeader from '@/components/lobby/LobbyHeader';
import PlayersList from '@/components/lobby/PlayersList';
import ManoJugador from '@/components/game/ManoJugador';
import { partidaService } from '@/services/partida.service';
import { useLobbyRealTime } from '@/hooks/useLobbyRealTime';
import { readJugadorId, persistJugadorId } from '@/lib/partidaUtils';

export default function JuegoPage() {
  const params = useParams();
  const router = useRouter();
  const codigo = params?.codigo as string;

  const [jugadorId, setJugadorId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<any | null>(null);
  const [cartasDB, setCartasDB] = useState<Record<string, any>>({});

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
              <div className="bg-black/80 p-6 rounded-lg border border-orange-500/30">
                <h2 className="text-xl font-bold text-orange-500">Mesa</h2>
                <div className="mt-4 min-h-[220px] bg-gray-900/40 border border-gray-800 rounded p-4 text-gray-300">Aquí se mostrarán las cartas jugadas y el estado de la ronda.</div>
              </div>

              <div className="bg-black/80 p-4 rounded-lg border border-orange-500/30">
                <h3 className="text-lg text-white mb-2">Mi Mano</h3>
                {detalle.miJugador && Array.isArray(detalle.miJugador.cartasEnMano) ? (
                  <ManoJugador cartasCodigos={detalle.miJugador.cartasEnMano} cartasDB={cartasDB} />
                ) : (
                  <div className="text-sm text-gray-300">Esperando asignación de jugador... Por favor, asegúrate de estar registrado en la partida.</div>
                )}
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
