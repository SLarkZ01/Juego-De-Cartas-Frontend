'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLobbyRealTime } from '@/hooks/useLobbyRealTime';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import LobbyHeader from '@/components/lobby/LobbyHeader';
import PlayersList from '@/components/lobby/PlayersList';
import LobbyInfo from '@/components/lobby/LobbyInfo';
import Modal from '@/components/ui/Modal';
import Toast from '@/components/ui/Toast';
import { partidaService } from '@/services/partida.service';
import { readJugadorId, persistJugadorId } from '@/lib/partidaUtils';

export default function PartidaPage() {
  const params = useParams();
  const router = useRouter();
  const codigo = params?.codigo as string;

  const { user, isAuthenticated, loading: authLoading } = useAuth() as any;
  const [jugadorId, setJugadorId] = useState<string | null>(null);
  
  // Handler cuando el backend notifica que la partida fue eliminada (creador salió)
  const handlePartidaEliminada = () => {
    try {
      persistJugadorId(codigo, '');
    } catch (e) {
      console.warn('No se pudo eliminar jugadorId de localStorage tras eliminación de partida:', e);
    }

    // Mostrar modal bonito a los jugadores restantes y luego redirigir
    setShowCancelledModal(true);
    setTimeout(() => {
      setShowCancelledModal(false);
      router.push('/jugar');
    }, 2200);
  };

  // Al recibir mensajes del topic principal, buscamos PARTIDA_INICIADA para cargar detalle privado
  const handlePartidaMessage = useCallback(async (payload: any) => {
    try {
      // Detectar evento de inicio
      const tipo = payload?.event || payload?.tipo || payload?.eventType || (payload?.datos && payload.datos.event);
      if (tipo === 'PARTIDA_INICIADA' || (payload && payload.turnoActual)) {
        // pedir detalle privado
        try {
          const detalle = await fetch(`/api/partidas/${codigo}/detalle?jugadorId=${encodeURIComponent(jugadorId || '')}`, { credentials: 'include' });
          if (detalle.ok) {
            const data = await detalle.json();
            // Si obtuvimos la mano privada, navegar a la UI de partida (o mostrar toast)
            // Aquí asumimos que la ruta /partida/{codigo} ya corresponde al lobby y la UI de juego
            // se montará cuando el estado de la aplicación lo requiera.
            setToastMessage('Partida iniciada — cargando mano privada...');
            // opcional: redirigir a la misma página para forzar recarga de componentes del juego
            // router.push(`/partida/${codigo}`);
          } else {
            console.warn('[handlePartidaMessage] GET detalle devolvió error, código', detalle.status);
            // reintentar breve
            setTimeout(async () => {
              try {
                const r2 = await fetch(`/api/partidas/${codigo}/detalle?jugadorId=${encodeURIComponent(jugadorId || '')}`, { credentials: 'include' });
                if (r2.ok) setToastMessage('Mano cargada');
              } catch (e) {}
            }, 300);
          }
        } catch (e) {
          console.warn('[handlePartidaMessage] error pidiendo detalle tras PARTIDA_INICIADA', e);
        }
      }
    } catch (e) {
      console.warn('[handlePartidaMessage] error procesando mensaje', e);
    }
  }, [codigo, jugadorId]);

  // Hook específico para el lobby en tiempo real (ahora con callback para partida eliminada and partida messages)
  const { jugadores: jugadoresLobby, connected: lobbyConnected, loading: lobbyLoading, registerSession } = useLobbyRealTime(codigo, jugadorId, handlePartidaEliminada, handlePartidaMessage);

  // Debounce visual del estado conectado para evitar flicker corto
  const [visualConectado, setVisualConectado] = useState<boolean>(false);
  useEffect(() => {
    let t: number | undefined;
    const estadoActual = lobbyConnected;

    if (estadoActual) {
      setVisualConectado(true);
    } else {
      t = window.setTimeout(() => setVisualConectado(false), 800);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [lobbyConnected]);

  const [showConfirmSalir, setShowConfirmSalir] = useState(false);
  const [showCancelledModal, setShowCancelledModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // esperar a que el contexto de auth haya cargado antes de redirigir
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, router, authLoading]);

  useEffect(() => {
    if (!codigo) return;

    const init = async () => {
      try {
        // Primero, intentar recuperar jugadorId guardado
        let currentJugadorId = undefined;
        try {
          currentJugadorId = readJugadorId(codigo) || undefined;
          console.log('[page init] jugadorId recuperado de localStorage:', currentJugadorId);
        } catch (e) {
          console.warn('No se pudo leer jugadorId de localStorage en init:', e);
        }

        if (currentJugadorId) {
          setJugadorId(currentJugadorId);
        } else {
          // Intentar reconectar; el backend puede devolver jugadorId
          try {
            const resp = await partidaService.reconectarPartida(codigo);
            if (resp && resp.jugadorId) {
              setJugadorId(resp.jugadorId);
              try { persistJugadorId(codigo, resp.jugadorId); } catch (e) {}
            }
          } catch (reErr) {
            console.warn('[page init] reconectarPartida falló:', reErr);
          }
        }
      } catch (err) {
        console.error('Error inicializando partida:', err);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  useEffect(() => {
    if (jugadorId && codigo) {
      try { persistJugadorId(codigo, jugadorId); } catch (e) {}
    }
  }, [jugadorId, codigo]);

  // We keep lobby UI simple; events are handled in the lobby hook and the players list.

  // We rely on useLobbyRealTime for WS subscription and registration; no additional WS handler here.

  if (!isAuthenticated) return null;

  // Handler para mostrar confirmación de salida
  const handleSalir = () => setShowConfirmSalir(true);

  const confirmSalir = async () => {
    setShowConfirmSalir(false);
    if (!codigo) return;

    try {
      await partidaService.salirPartida(codigo);
      try { persistJugadorId(codigo, ''); } catch (e) { /* ignore */ }

      setToastMessage('Has salido de la partida. Volviendo al listado...');
      setTimeout(() => router.push('/jugar'), 1200);
    } catch (err: any) {
      console.error('Error saliendo de la partida:', err);
      setToastMessage(err?.message || 'Error al salir de la partida');
    }
  };

  const cancelSalir = () => setShowConfirmSalir(false);

  // Manejar inicio de la partida desde el lobby (creador)
  const handleStartGame = async () => {
    if (!codigo) return;
    setStarting(true);
    setToastMessage('Iniciando partida...');

    try {
      // Publish registrar via STOMP to guarantee sessionId->jugadorId mapping before starting
      try {
        registerSession(jugadorId);
      } catch (e) {
        console.warn('[handleStartGame] registerSession failed', e);
      }

  // Small delay to give STOMP time to deliver registration to the server
  await new Promise((r) => setTimeout(r, 120));

      // Llamar al endpoint que inicia la partida
      await partidaService.iniciarPartida(codigo);
      // Si el POST es exitoso, esperamos el evento PARTIDA_INICIADA vía WS (handlePartidaMessage)
      setToastMessage('Solicitud de inicio enviada, esperando confirmación...');
    } catch (err: any) {
      console.error('Error iniciando partida:', err);
      setToastMessage(err?.message || 'Error al iniciar partida');
      setStarting(false);
    }
  };

  // Log para diagnóstico (lobby-focused)
  if (process.env.NODE_ENV === 'development') {
    console.log('[PartidaPage - Lobby] Estado actual:', {
      partidaCodigo: codigo,
      jugadoresCount: jugadoresLobby.length || 0,
      jugadorIdLocal: jugadorId,
      jugadores: jugadoresLobby.map(j => ({ id: j.id, nombre: j.nombre })),
    });
  }

  return (
    <div className="relative min-h-screen bg-black">
      <Image src="/images/fondo.webp" alt="Fondo" fill className="object-cover opacity-30" priority />

      <div className="relative z-10 min-h-screen p-4">
        <LobbyHeader codigo={codigo} estado={'ESPERANDO'} visualConectado={visualConectado} onSalir={handleSalir} />

        {/* Modales / toasts */}
        <Modal open={showConfirmSalir} title="Confirmar salida" onClose={cancelSalir}>
          <p className="mb-4">¿Seguro que quieres salir de la partida?</p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" className="bg-white/10 text-white hover:bg-white/20" onClick={cancelSalir}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmSalir}>Salir</Button>
          </div>
        </Modal>

        <Modal open={showCancelledModal} title="Partida cancelada" onClose={() => setShowCancelledModal(false)}>
          <p>La partida ha sido cancelada por el creador. Serás redirigido al listado de partidas.</p>
        </Modal>

        <Toast message={toastMessage} open={!!toastMessage} onClose={() => setToastMessage('')} />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            {/* Estado del lobby (loading/reconectando/sin jugadores) */}
            {lobbyLoading && (
              <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-4 text-center text-gray-400">
                <p>Cargando lobby...</p>
              </div>
            )}

            {!lobbyLoading && !lobbyConnected && (
              <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-4 text-center text-gray-400">
                <p>Reconectando...</p>
              </div>
            )}

            {!lobbyLoading && lobbyConnected && jugadoresLobby.length === 0 && (
              <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-4 text-center text-gray-400">
                <p>No hay jugadores en la partida</p>
                <p className="text-xs mt-2">Esperando conexión...</p>
              </div>
            )}

            {/* Lista de jugadores */}
            {lobbyConnected && jugadoresLobby.length > 0 && (
              <PlayersList jugadores={jugadoresLobby as any} partidaTurno={undefined} />
            )}

            <LobbyInfo partidaEstado={'ESPERANDO'} jugadoresLobbyCount={jugadoresLobby.length} puedesIniciar={jugadoresLobby.length > 0 && jugadoresLobby[0].id === jugadorId} onIniciar={handleStartGame} starting={starting} />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-6">
              <h2 className="text-2xl font-bold text-orange-500 mb-4">Lobby</h2>
              <p className="text-gray-400">Aquí puedes ver quién está conectado y esperar hasta que el creador inicie la partida.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
