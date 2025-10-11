'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { partidaService, gameplayService } from '@/services/partida.service';
import { websocketService } from '@/lib/websocket';
import { authService } from '@/services/auth.service';
import type {
  PartidaResponse,
  PartidaDetailResponse,
  EventoWebSocket,
  AccionWebSocket,
} from '@/types/api';

/**
 * Hook personalizado para manejar partidas
 * Gestiona el estado de la partida y la comunicación WebSocket
 */
export function usePartida(codigoPartida?: string) {
  const [partida, setPartida] = useState<PartidaDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventos, setEventos] = useState<EventoWebSocket[]>([]);
  const [conectado, setConectado] = useState(false);
  
  const jugadorIdRef = useRef<string | null>(null);
  const disconnectTimerRef = useRef<number | null>(null);
  const [jugadorIdState, setJugadorIdState] = useState<string | null>(null);

  function setJugadorIdRef(id: string | null) {
    jugadorIdRef.current = id;
    setJugadorIdState(id);
  }

  /**
   * Crear nueva partida
   */
  const crearPartida = useCallback(async (): Promise<PartidaResponse> => {
    setLoading(true);
    setError(null);
    
    try {
  const response = await partidaService.crearPartida();
  setJugadorIdRef(response.jugadorId);
      // Persistir jugadorId para que la nueva página (lobby) pueda recuperar la identidad
      try {
        if (response && response.codigo && response.jugadorId) {
          localStorage.setItem(`jugadorId_${response.codigo}`, response.jugadorId);
        }
      } catch (e) {
        console.warn('No se pudo guardar jugadorId en localStorage:', e);
      }
      // Note: page will call cargarDetalle on mount; avoid calling it here to keep flow simple
      return response;
    } catch (err: any) {
      const errorMsg = err.message || 'Error al crear partida';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Unirse a partida existente
   */
  const unirsePartida = useCallback(async (codigo: string): Promise<PartidaResponse> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await partidaService.unirsePartida(codigo);
      setJugadorIdRef(response.jugadorId);
      // Persistir jugadorId para que la página de la partida lo recupere al montar
      try {
        if (response && response.codigo && response.jugadorId) {
          localStorage.setItem(`jugadorId_${response.codigo}`, response.jugadorId);
        }
      } catch (e) {
        console.warn('No se pudo guardar jugadorId en localStorage:', e);
      }
      return response;
    } catch (err: any) {
      const errorMsg = err.message || 'Error al unirse a la partida';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Cargar detalle de la partida
   */
  const cargarDetalle = useCallback(async (codigo: string, jugadorId?: string) => {
    const jId = jugadorId || jugadorIdRef.current || jugadorIdState || undefined;
    if (!jId) {
      setError('ID de jugador no disponible');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const detalle = await partidaService.obtenerPartidaDetalle(codigo, jId);
      if (process.env.NODE_ENV === 'development') {
        try {
          console.log('[usePartida] detalle obtenido:', { codigo, jugadorId: jId, detalleSnippet: { jugadores: detalle.jugadores?.length, miJugador: detalle.miJugador ? true : false } });
        } catch (e) {}
      }
      setPartida(detalle);
      return detalle;
    } catch (err: any) {
      const errorMsg = err.message || 'Error al cargar detalle de partida';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Iniciar partida
   */
  const iniciarPartida = useCallback(async (codigo: string) => {
    setLoading(true);
    setError(null);
    
    try {
      await partidaService.iniciarPartida(codigo);
    } catch (err: any) {
      const errorMsg = err.message || 'Error al iniciar partida';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Seleccionar atributo
   */
  const seleccionarAtributo = useCallback(async (codigo: string, atributo: string) => {
    const jugadorId = jugadorIdRef.current;
    if (!jugadorId) {
      throw new Error('ID de jugador no disponible');
    }

    setLoading(true);
    setError(null);
    
    try {
      await gameplayService.seleccionarAtributo(codigo, { jugadorId, atributo });
    } catch (err: any) {
      const errorMsg = err.message || 'Error al seleccionar atributo';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Jugar carta
   */
  const jugarCarta = useCallback(async (codigo: string) => {
    const jugadorId = jugadorIdRef.current;
    if (!jugadorId) {
      throw new Error('ID de jugador no disponible');
    }

    setLoading(true);
    setError(null);
    
    try {
      await gameplayService.jugarCarta(codigo, { jugadorId });
    } catch (err: any) {
      const errorMsg = err.message || 'Error al jugar carta';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Activar transformación
   */
  const activarTransformacion = useCallback(async (codigo: string, indiceTransformacion: number) => {
    const jugadorId = jugadorIdRef.current;
    if (!jugadorId) {
      throw new Error('ID de jugador no disponible');
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await gameplayService.activarTransformacion(codigo, {
        jugadorId,
        indiceTransformacion,
      });
      return response;
    } catch (err: any) {
      const errorMsg = err.message || 'Error al activar transformación';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Desactivar transformación
   */
  const desactivarTransformacion = useCallback(async (codigo: string) => {
    const jugadorId = jugadorIdRef.current;
    if (!jugadorId) {
      throw new Error('ID de jugador no disponible');
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await gameplayService.desactivarTransformacion(codigo, { jugadorId });
      return response;
    } catch (err: any) {
      const errorMsg = err.message || 'Error al desactivar transformación';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Conectar a WebSocket y suscribirse a eventos
   */
  const conectarWebSocket = useCallback(async (codigo: string) => {
    try {
      // Antes de conectar WS, intentar recuperar jugadorId persistido en localStorage (por si se navegó)
      try {
        if (!jugadorIdRef.current) {
          try {
            const persisted = localStorage.getItem(`jugadorId_${codigo}`);
            if (persisted) {
                  setJugadorIdRef(persisted);
                }
          } catch (e) {
            console.warn('No se pudo leer jugadorId de localStorage:', e);
          }
        }

        const savedJugadorId = jugadorIdRef.current;
        const user = authService.getCurrentUser();
        const jugadorIdToSend = savedJugadorId || user?.userId;

        if (jugadorIdToSend) {
          console.log('[usePartida] Intentando reconectar jugador en backend (con reintentos):', jugadorIdToSend);
          // Retry reconectar up to 3 times with linear backoff
          let resp: PartidaResponse | null = null;
          let lastErr: any = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              resp = await partidaService.reconectarPartida(codigo, jugadorIdToSend);
              lastErr = null;
              break;
            } catch (e) {
              lastErr = e;
              console.warn(`[usePartida] reconectarPartida attempt ${attempt} failed:`, e);
              await new Promise((r) => setTimeout(r, 150 * attempt));
            }
          }

          if (lastErr) {
            console.warn('[usePartida] Reconectar failed after retries (continuando):', lastErr);
          }

          if (resp && resp.jugadorId) {
            setJugadorIdRef(resp.jugadorId);
            try {
              localStorage.setItem(`jugadorId_${codigo}`, resp.jugadorId);
            } catch (e) {
              console.warn('No se pudo persistir jugadorId tras reconectar:', e);
            }

            // expose jugadorId to consumers via setJugadorId side-effect if provided
            // (the page sets it via hook.setJugadorId)
          }

          // Actualizar partida local si se devuelve estado
          if (resp && (resp as any).jugadores) {
            // Merge básico
            setPartida((prev) => ({ ...(prev as any), ...(resp as any) } as PartidaDetailResponse));
          }

          // Si el backend no nos reportó inmediatamente como conectado, hacer polling
          // por un tiempo corto para esperar a que el backend confirme la reconexión
          try {
            const jugadorIdToCheck = resp?.jugadorId || jugadorIdToSend;
            if (jugadorIdToCheck) {
              const start = Date.now();
              const timeout = 3000; // ms
              let confirmado = false;
              while (Date.now() - start < timeout && !confirmado) {
                try {
                  const detalle = await partidaService.obtenerPartidaDetalle(codigo, jugadorIdToCheck as string);
                  if (detalle && detalle.miJugador && (detalle.miJugador as any).conectado) {
                    setPartida(detalle);
                    confirmado = true;
                    break;
                  }
                } catch (e) {
                  // ignore and retry
                }
                await new Promise((r) => setTimeout(r, 250));
              }

              if (!confirmado) {
                console.warn('[usePartida] No se confirmó reconexión en el intervalo esperado (continuando)');
              }
            }
          } catch (pollErr) {
            console.warn('[usePartida] Error durante polling de reconexión (continuando):', pollErr);
          }
        }
      } catch (reErr) {
        console.warn('[usePartida] Reconectar failed (continuando):', reErr);
      }
      await websocketService.subscribeToPartida(codigo, (evento: EventoWebSocket) => {
        // Validar que el evento existe y tiene tipo
        if (!evento || !evento.tipo) {
          console.error('❌ Evento inválido recibido:', evento);
          return;
        }

        console.log('✅ Evento procesado:', evento.tipo, evento);

        // Agregar evento a la lista
        setEventos((prev) => [evento, ...prev].slice(0, 100)); // Mantener últimos 100 eventos

        // Actualizar estado según el tipo de evento
  const tipoStr = String(evento.tipo);
  if ((tipoStr === 'ESTADO_ACTUALIZADO' || tipoStr === 'PARTIDA_ESTADO') && evento.datos) {
          setPartida((prev) => {
            if (!prev) return evento.datos as PartidaDetailResponse;
            return {
              ...prev,
              ...evento.datos,
            } as PartidaDetailResponse;
          });
  } else if (String(evento.tipo) === 'JUGADOR_UNIDO') {
          // Actualizar lista de jugadores cuando alguien se une
          // Algunos eventos JUGADOR_UNIDO pueden ser compactos y no traer la lista completa;
          // en ese caso forzamos a recargar el detalle desde el servidor.
          if (evento.datos && (evento.datos as any).jugadores && (evento.datos as any).jugadores.length > 0) {
            setPartida((prev) => {
              if (!prev) return evento.datos as PartidaDetailResponse;
              return {
                ...prev,
                jugadores: (evento.datos as any).jugadores || prev.jugadores,
              } as PartidaDetailResponse;
            });
          } else {
            // Fallback: pedir detalle completo al servidor
            (async () => {
              try {
                const jId = jugadorIdRef.current || undefined;
                if (!codigo) return;
                const detalle = await partidaService.obtenerPartidaDetalle(codigo, jId as string);
                setPartida(detalle);
              } catch (err) {
                console.warn('[usePartida] No se pudo recargar detalle tras JUGADOR_UNIDO:', err);
              }
            })();
          }
        } else if (evento.tipo === 'PARTIDA_INICIADA' && evento.datos) {
          // Actualizar estado cuando la partida inicia
          setPartida((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              estado: 'EN_CURSO',
              ...evento.datos,
            };
          });
        }
      });

      setConectado(true);
    } catch (err: any) {
      console.error('Error conectando WebSocket:', err);
      setError('Error al conectar con el servidor');
    }
  }, []);

  /**
   * Desconectar WebSocket
   */
  const desconectarWebSocket = useCallback(() => {
    if (codigoPartida) {
      websocketService.unsubscribeFromPartida(codigoPartida);
      setConectado(false);
    }
  }, [codigoPartida]);

  /**
   * Enviar acción por WebSocket
   */
  const enviarAccion = useCallback((codigo: string, accion: AccionWebSocket, datos?: any) => {
    const jugadorId = jugadorIdRef.current;
    if (!jugadorId) {
      throw new Error('ID de jugador no disponible');
    }

    websocketService.sendAction(codigo, {
      accion,
      jugadorId,
      ...datos,
    });
  }, []);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (codigoPartida) {
        websocketService.unsubscribeFromPartida(codigoPartida);
      }
    };
  }, [codigoPartida]);

  return {
    partida,
    loading,
    error,
    eventos,
    conectado,
    jugadorId: jugadorIdState,
    
    // Métodos
    crearPartida,
    unirsePartida,
    cargarDetalle,
    iniciarPartida,
    seleccionarAtributo,
    jugarCarta,
    activarTransformacion,
    desactivarTransformacion,
    conectarWebSocket,
    desconectarWebSocket,
    enviarAccion,
    
    // Helper para establecer jugadorId manualmente si es necesario
    setJugadorId: (id: string) => setJugadorIdRef(id),
  };
}

