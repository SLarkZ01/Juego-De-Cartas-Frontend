'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePartida } from '@/hooks/usePartida';
import { Button } from '@/components/ui/button';
import CartaComponent from '@/components/game/CartaComponent';
import ListaJugadores from '@/components/game/ListaJugadores';
import { cartaService } from '@/services/partida.service';
import type { Carta } from '@/types/api';
import Image from 'next/image';

export default function PartidaPage() {
  const params = useParams();
  const router = useRouter();
  const codigo = params?.codigo as string;
  
  const { user, isAuthenticated, loading: authLoading } = useAuth() as any;
  const {
    partida,
    loading,
    error,
    eventos,
    conectado,
    jugadorId,
    cargarDetalle,
    iniciarPartida,
    seleccionarAtributo,
    jugarCarta,
    activarTransformacion,
    conectarWebSocket,
    setJugadorId,
  } = usePartida(codigo);

  // Debounce visual del estado conectado para evitar flicker corto
  const [visualConectado, setVisualConectado] = useState<boolean>(conectado);
  useEffect(() => {
    let t: number | undefined;
    if (conectado) {
      setVisualConectado(true);
    } else {
      t = window.setTimeout(() => setVisualConectado(false), 800);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [conectado]);

  const [cartasDisponibles, setCartasDisponibles] = useState<Carta[]>([]);
  const [mensajeEvento, setMensajeEvento] = useState<string>('');

  useEffect(() => {
    // esperar a que el contexto de auth haya cargado antes de redirigir
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, router, authLoading]);

  useEffect(() => {
    if (!codigo) return;

    const init = async () => {
      try {
        let savedJugadorId = undefined;
        try {
          savedJugadorId = localStorage.getItem(`jugadorId_${codigo}`) || undefined;
        } catch (e) {
          console.warn('No se pudo leer jugadorId de localStorage en init:', e);
        }

        if (savedJugadorId) {
          setJugadorId(savedJugadorId);
          await cargarDetalle(codigo, savedJugadorId);
        } else {
          // Intentar reconectar vía REST sin jugadorId (usar token en cookie si está presente)
          try {
            const resp = await (await import('@/services/partida.service')).partidaService.reconectarPartida(codigo);
            if (resp && resp.jugadorId) {
              setJugadorId(resp.jugadorId);
              try { localStorage.setItem(`jugadorId_${codigo}`, resp.jugadorId); } catch (e) {}
              // cargar detalle con el jugadorId
              await cargarDetalle(codigo, resp.jugadorId);
              // Si el backend está algo retrasado en publicar el estado completo, intentar un par de reintentos cortos
              (async () => {
                try {
                  await new Promise(r => setTimeout(r, 300));
                  await cargarDetalle(codigo, resp.jugadorId);
                  await new Promise(r => setTimeout(r, 700));
                  await cargarDetalle(codigo, resp.jugadorId);
                } catch (e) {
                  // ignore
                }
              })();
            } else {
              // fallback: intentar cargar detalle sin jugadorId (puede devolver vista pública)
              await cargarDetalle(codigo, user?.userId);
            }
          } catch (reErr) {
            console.warn('Reconectar sin jugadorId falló (continuando):', reErr);
            await cargarDetalle(codigo, user?.userId);
          }
        }

        await conectarWebSocket(codigo);
        const cartas = await cartaService.obtenerCartas();
        setCartasDisponibles(cartas);
      } catch (err) {
        console.error('Error inicializando partida:', err);
      }
    };

    init();
  }, [codigo, isAuthenticated, user]);

  useEffect(() => {
    if (jugadorId && codigo) {
      localStorage.setItem(`jugadorId_${codigo}`, jugadorId);
    }
  }, [jugadorId, codigo]);

  useEffect(() => {
    if (eventos.length > 0) {
      const ultimoEvento = eventos[0];
      
      // Validar que el evento existe
      if (!ultimoEvento || !ultimoEvento.tipo) {
        console.warn('⚠️ Evento inválido en useEffect:', ultimoEvento);
        return;
      }

      // Generar mensaje descriptivo según el tipo de evento
      let mensaje = ultimoEvento.mensaje || '';
      
      switch (ultimoEvento.tipo) {
        case 'JUGADOR_UNIDO':
          mensaje = mensaje || '¡Un nuevo jugador se ha unido a la partida!';
          break;
        case 'JUGADOR_DESCONECTADO':
          mensaje = mensaje || 'Un jugador se ha desconectado';
          break;
        case 'PARTIDA_INICIADA':
          mensaje = mensaje || '🎮 ¡La partida ha comenzado!';
          break;
        case 'TURNO_CAMBIADO':
          mensaje = mensaje || 'Cambio de turno';
          break;
        case 'ATRIBUTO_SELECCIONADO':
          mensaje = mensaje || `Atributo seleccionado`;
          break;
        case 'CARTA_JUGADA':
          mensaje = mensaje || 'Carta jugada';
          break;
        case 'RONDA_COMPLETADA':
          mensaje = mensaje || '🏆 Ronda completada';
          break;
        case 'PARTIDA_FINALIZADA':
          mensaje = mensaje || '🎉 ¡Partida finalizada!';
          break;
        case 'TRANSFORMACION_ACTIVADA':
          mensaje = mensaje || '⚡ Transformación activada';
          break;
        default:
          mensaje = mensaje || `Evento: ${ultimoEvento.tipo}`;
      }

      setMensajeEvento(mensaje);
      const timer = setTimeout(() => setMensajeEvento(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [eventos]);

  if (!isAuthenticated) return null;

  if (loading && !partida) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-white text-xl">Cargando partida...</p>
        </div>
      </div>
    );
  }

  if (error && !partida) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-8 max-w-md">
          <h2 className="text-2xl font-bold text-red-200 mb-4">Error</h2>
          <p className="text-red-200 mb-4">{error}</p>
          <Button onClick={() => router.push('/jugar')} className="w-full">Volver</Button>
        </div>
      </div>
    );
  }

  if (!partida) return null;

  const miJugador = partida.miJugador;
  const esMiTurno = partida.turnoActual === jugadorId;
  const cartaActual = miJugador?.cartaActual 
    ? cartasDisponibles.find(c => c.codigo === miJugador.cartaActual)
    : null;

  return (
    <div className="relative min-h-screen bg-black">
      <Image src="/images/fondo.webp" alt="Fondo" fill className="object-cover opacity-30" priority />

      <div className="relative z-10 min-h-screen p-4">
        <div className="max-w-7xl mx-auto mb-6">
          <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-orange-500">Partida: {codigo}</h1>
                <p className="text-gray-400">Estado: <span className="text-white font-semibold">{partida.estado}</span></p>
              </div>

              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${visualConectado ? 'bg-green-900/30 border border-green-500' : 'bg-red-900/30 border border-red-500'}`}>
                  <div className={`w-3 h-3 rounded-full ${visualConectado ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                  <span className="text-sm text-white">{visualConectado ? 'Conectado' : 'Desconectado'}</span>
                </div>
                <Button onClick={() => router.push('/jugar')} variant="outline">Salir</Button>
              </div>
            </div>

            {mensajeEvento && (
              <div className="mt-4 p-3 bg-blue-900/30 border border-blue-500 rounded-lg">
                <p className="text-blue-200 text-center">{mensajeEvento}</p>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <ListaJugadores jugadores={partida.jugadores} jugadorActualId={jugadorId || ''} turnoActualId={partida.turnoActual} />

            <div className="mt-6 bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-4">
              <h3 className="text-lg font-bold text-orange-500 mb-3">Información</h3>
              
              {partida.estado === 'ESPERANDO' && (
                <div className="space-y-3">
                  <p className="text-gray-300 text-sm">Esperando jugadores... ({partida.jugadores.length}/7)</p>
                  {partida.jugadores.length >= 2 && partida.jugadores[0].id === jugadorId && (
                    <Button onClick={() => iniciarPartida(codigo)} className="w-full bg-green-600 hover:bg-green-700">🎮 Iniciar Partida</Button>
                  )}
                </div>
              )}

              {partida.atributoSeleccionado && (
                <div className="p-3 bg-orange-900/30 border border-orange-500 rounded-lg">
                  <p className="text-sm text-gray-300">Atributo en juego:</p>
                  <p className="text-xl font-bold text-orange-400 capitalize">{partida.atributoSeleccionado}</p>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {cartaActual && (
              <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-6">
                <h2 className="text-2xl font-bold text-orange-500 mb-4">Tu Carta</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <CartaComponent carta={cartaActual} atributoSeleccionado={partida.atributoSeleccionado || undefined} className="max-w-sm mx-auto" />
                  </div>

                  <div className="space-y-4">
                    {esMiTurno && partida.estado === 'EN_CURSO' && !partida.atributoSeleccionado && (
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-3">Selecciona un atributo</h3>
                        <div className="grid grid-cols-2 gap-2">
                          {cartaActual.atributos && Object.keys(cartaActual.atributos).map((atributo) => (
                            <Button key={atributo} onClick={() => seleccionarAtributo(codigo, atributo)} className="capitalize" disabled={loading}>{atributo}</Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {esMiTurno && partida.atributoSeleccionado && (
                      <Button onClick={() => jugarCarta(codigo)} className="w-full bg-orange-600 hover:bg-orange-700 text-lg py-6" disabled={loading}>🎴 Jugar Carta</Button>
                    )}

                    {cartaActual.transformaciones && cartaActual.transformaciones.length > 0 && (
                      <div className="border-t border-gray-700 pt-4">
                        <h3 className="text-lg font-semibold text-white mb-3">Transformaciones</h3>
                        <div className="space-y-2">
                          {cartaActual.transformaciones.map((trans, idx) => (
                            <Button key={idx} onClick={() => activarTransformacion(codigo, idx)} className="w-full justify-start" variant="outline" disabled={loading}>
                              <span className="mr-2">⚡</span>{trans.nombre}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {!esMiTurno && (
                      <div className="p-4 bg-gray-900/50 border border-gray-700 rounded-lg text-center">
                        <p className="text-gray-400">Esperando tu turno...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {eventos.length > 0 && (
              <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-4">
                <h3 className="text-lg font-bold text-orange-500 mb-3">Eventos Recientes</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {eventos.slice(0, 10).map((evento, idx) => {
                    if (!evento || !evento.tipo) return null;
                    
                    // Generar mensaje descriptivo
                    let mensaje = evento.mensaje || '';
                    let icono = '📢';
                    
                    switch (evento.tipo) {
                      case 'JUGADOR_UNIDO':
                        icono = '👋';
                        mensaje = mensaje || 'Nuevo jugador se unió';
                        break;
                      case 'JUGADOR_DESCONECTADO':
                        icono = '🚪';
                        mensaje = mensaje || 'Jugador desconectado';
                        break;
                      case 'PARTIDA_INICIADA':
                        icono = '🎮';
                        mensaje = mensaje || 'Partida iniciada';
                        break;
                      case 'TURNO_CAMBIADO':
                        icono = '🔄';
                        mensaje = mensaje || 'Cambió el turno';
                        break;
                      case 'ATRIBUTO_SELECCIONADO':
                        icono = '🎯';
                        mensaje = mensaje || 'Atributo seleccionado';
                        break;
                      case 'CARTA_JUGADA':
                        icono = '🃏';
                        mensaje = mensaje || 'Carta jugada';
                        break;
                      case 'RONDA_COMPLETADA':
                        icono = '🏆';
                        mensaje = mensaje || 'Ronda completada';
                        break;
                      case 'PARTIDA_FINALIZADA':
                        icono = '🎉';
                        mensaje = mensaje || 'Partida finalizada';
                        break;
                      case 'TRANSFORMACION_ACTIVADA':
                        icono = '⚡';
                        mensaje = mensaje || 'Transformación activada';
                        break;
                      case 'ERROR':
                        icono = '❌';
                        break;
                      default:
                        icono = '📢';
                    }

                    return (
                      <div key={idx} className="p-3 bg-gray-900/50 rounded border border-gray-700 hover:border-orange-500/50 transition-colors">
                        <div className="flex items-start gap-2">
                          <span className="text-xl">{icono}</span>
                          <div className="flex-1">
                            <span className="text-orange-400 font-semibold text-sm block">
                              {evento.tipo.replace(/_/g, ' ')}
                            </span>
                            {mensaje && (
                              <span className="text-gray-300 text-sm block mt-1">
                                {mensaje}
                              </span>
                            )}
                            {evento.timestamp && (
                              <span className="text-gray-500 text-xs block mt-1">
                                {new Date(evento.timestamp).toLocaleTimeString('es-ES')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
