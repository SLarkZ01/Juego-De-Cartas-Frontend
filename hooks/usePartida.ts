'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { partidaService, gameplayService } from '@/services/partida.service';
import { websocketService } from '@/lib/websocket';
import { authService } from '@/services/auth.service';
import type {
  PartidaResponse,
  PartidaDetailResponse,
  EventoWebSocket,
} from '@/types/api';
import { AccionWebSocket } from '@/types/api';

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
      
      // Persistir jugadorId inmediatamente
      try {
        if (response && response.codigo && response.jugadorId) {
          localStorage.setItem(`jugadorId_${response.codigo}`, response.jugadorId);
          console.log('[usePartida.crearPartida] jugadorId guardado:', response.jugadorId);
        }
      } catch (e) {
        console.warn('No se pudo guardar jugadorId en localStorage:', e);
      }
      
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
      
      // Persistir jugadorId inmediatamente
      try {
        if (response && response.codigo && response.jugadorId) {
          localStorage.setItem(`jugadorId_${response.codigo}`, response.jugadorId);
          console.log('[usePartida.unirsePartida] jugadorId guardado:', response.jugadorId);
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
          console.log('[usePartida] detalle obtenido:', { 
            codigo, 
            jugadorId: jId, 
            detalleSnippet: { 
              jugadores: detalle.jugadores?.length, 
              miJugador: detalle.miJugador ? true : false,
              jugadoresCompleto: detalle.jugadores,
            } 
          });
        } catch (e) {}
      }
      
      // Asegurar que jugadores es un array válido
      if (!Array.isArray(detalle.jugadores)) {
        console.warn('[usePartida] detalle.jugadores no es un array, usando array vacío');
        detalle.jugadores = [];
      }
      
      // CRÍTICO: Verificar que el jugador local aparece en la lista
      // Si no está pero tenemos jugadorId, agregarlo manualmente
      if (jId && detalle.jugadores && Array.isArray(detalle.jugadores)) {
        const foundInList = detalle.jugadores.some((j: any) => String(j.id) === String(jId));
        if (!foundInList && detalle.miJugador) {
          // El servidor no incluyó al jugador en la lista pública pero sí devolvió miJugador
          // Esto puede pasar por inconsistencias del backend - agregar manualmente
          console.warn('[usePartida] Jugador local NO en jugadores[], agregando manualmente:', jId);
          
          const miJugadorPublic = {
            id: detalle.miJugador.id || jId,
            nombre: detalle.miJugador.nombre || 'Yo',
            numeroCartas: detalle.miJugador.numeroCartas || 0,
            orden: 0,
            conectado: true,
          };
          
          detalle.jugadores = [miJugadorPublic, ...detalle.jugadores];
        }
      }
      
      setPartida(detalle);
      // Verificar inmediatamente si nuestro jugador aparece en la lista recibida
      (async () => {
        try {
          await verifyAndRecoverMiJugador(codigo, jId);
        } catch (e) {
          // ignore recovery errors
        }
      })();
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
   * Si el jugador local no aparece en `partida.jugadores`, intentar recuperar:
   * - Llamar `obtenerPartidaDetalle` para pedir la vista personalizada
   * - Enviar SOLICITAR_ESTADO por WS y aggressiveRegister para reafirmar session->jugador
   */
  async function verifyAndRecoverMiJugador(codigo: string, jugadorId?: string | null) {
    try {
      const jId = jugadorId || jugadorIdRef.current || jugadorIdState || undefined;
      if (!jId) return;

      // Si no tenemos partida aún, nada que verificar
      if (!partida) return;

      const found = partida.jugadores?.some((p: any) => String(p.id) === String(jId));
      if (found) return; // todo ok

      console.warn('[usePartida] Mi jugador NO aparece en partida.jugadores — intentando recovery', { codigo, jugadorId: jId, jugadores: partida.jugadores?.map((p: any) => p.id) });

      // Intentar obtener detalle directamente (3 reintentos)
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const detalle = await partidaService.obtenerPartidaDetalle(codigo, jId as string);
          if (detalle && detalle.miJugador && (detalle.miJugador as any).id) {
            console.log('[usePartida] Recovery: detalle obtenido que incluye miJugador, aplicando estado');
            setPartida(detalle);
            return;
          }
        } catch (e) {
          console.warn(`[usePartida] intento ${attempt} obtenerPartidaDetalle falló:`, e);
        }
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }

      // Forzar SOLICITAR_ESTADO por WS y registros agresivos como último recurso
      try {
        websocketService.solicitarEstadoMultiple(codigo, jId);
        websocketService.aggressiveRegister(codigo, jId);
      } catch (e) {
        console.warn('[usePartida] Error enviando solicitudes WS de recovery:', e);
      }
    } catch (err) {
      console.warn('[usePartida] Error en verifyAndRecoverMiJugador:', err);
    }
  }

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

        // Log detallado para diagnóstico
        if (process.env.NODE_ENV === 'development') {
          console.log('[usePartida] Evento recibido:', {
            tipo: evento.tipo,
            datos: evento.datos,
            datosKeys: evento.datos ? Object.keys(evento.datos) : [],
            jugadores: (evento.datos as any)?.jugadores,
            miJugador: (evento.datos as any)?.miJugador,
          });
        }

        // Agregar evento a la lista
        setEventos((prev) => [evento, ...prev].slice(0, 100)); // Mantener últimos 100 eventos

        // Actualizar estado según el tipo de evento
        const tipoStr = String(evento.tipo);
        if ((tipoStr === 'ESTADO_ACTUALIZADO' || tipoStr === 'PARTIDA_ESTADO') && evento.datos) {
          // El servidor puede enviar PartidaResponse directamente en datos
          const datos = evento.datos as any;
          
          setPartida((prev) => {
            // Si datos contiene la estructura completa de PartidaDetailResponse
            if (datos.jugadores || datos.miJugador || datos.codigo) {
              if (process.env.NODE_ENV === 'development') {
                console.log('[usePartida] Aplicando PartidaResponse completo:', {
                  jugadoresCount: datos.jugadores?.length,
                  miJugadorId: datos.miJugador?.id,
                  codigo: datos.codigo,
                  datosCompletos: datos,
                });
              }
              
              // Asegurar que jugadores siempre sea un array
              const jugadores = Array.isArray(datos.jugadores) ? datos.jugadores : (prev?.jugadores || []);
              
              // CRÍTICO: Verificar que el jugador local aparece en jugadores[]
              // Si tenemos jugadorId pero no aparece en la lista, agregarlo
              const localJugadorId = jugadorIdRef.current || jugadorIdState;
              let jugadoresFinales = [...jugadores];
              
              if (localJugadorId) {
                const foundInList = jugadoresFinales.some((j: any) => String(j.id) === String(localJugadorId));
                
                if (!foundInList) {
                  console.warn('[usePartida WS] Jugador local NO en jugadores[], agregando:', localJugadorId);
                  
                  // Si tenemos miJugador en datos, usarlo; si no, crear uno básico
                  const miJugadorData = datos.miJugador || prev?.miJugador;
                  
                  if (miJugadorData) {
                    const miJugadorPublic = {
                      id: miJugadorData.id || localJugadorId,
                      nombre: miJugadorData.nombre || 'Yo',
                      numeroCartas: miJugadorData.numeroCartas || 0,
                      orden: jugadoresFinales.length,
                      conectado: true,
                    };
                    jugadoresFinales = [miJugadorPublic, ...jugadoresFinales];
                  } else {
                    // Crear jugador básico si no tenemos miJugador
                    const user = authService.getCurrentUser();
                    const jugadorBasico = {
                      id: localJugadorId,
                      nombre: user?.username || 'Yo',
                      numeroCartas: 0,
                      orden: jugadoresFinales.length,
                      conectado: true,
                    };
                    jugadoresFinales = [jugadorBasico, ...jugadoresFinales];
                  }
                }
              }
              
              // Usar datos completos del servidor
              const nuevaPartida: PartidaDetailResponse = {
                codigo: datos.codigo || prev?.codigo || '',
                jugadorId: datos.jugadorId || prev?.jugadorId || '',
                estado: datos.estado || prev?.estado || 'ESPERANDO',
                jugadores: jugadoresFinales,
                miJugador: datos.miJugador || prev?.miJugador || { id: '', nombre: '', cartasEnMano: [], numeroCartas: 0 },
                turnoActual: datos.turnoActual || prev?.turnoActual,
                atributoSeleccionado: datos.atributoSeleccionado || prev?.atributoSeleccionado,
                tiempoRestante: datos.tiempoRestante || prev?.tiempoRestante,
              };
              
              if (process.env.NODE_ENV === 'development') {
                console.log('[usePartida] Estado actualizado:', nuevaPartida);
              }
              
              return nuevaPartida;
            }
            
            // Si es un merge parcial
            if (!prev) {
              // Crear estructura mínima válida
              return {
                codigo: datos.codigo || '',
                jugadorId: datos.jugadorId || '',
                estado: datos.estado || 'ESPERANDO',
                jugadores: Array.isArray(datos.jugadores) ? datos.jugadores : [],
                miJugador: datos.miJugador || { id: '', nombre: '', cartasEnMano: [], numeroCartas: 0 },
              } as PartidaDetailResponse;
            }
            
            return {
              ...prev,
              ...datos,
              jugadores: Array.isArray(datos.jugadores) ? datos.jugadores : prev.jugadores,
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
      // After subscribing, if we don't receive a canonical Partida with jugadores quickly,
      // request the full detalle as a fallback (some backends only send compact events).
      (async () => {
        try {
          await new Promise((r) => setTimeout(r, 350));
          // If we don't have players yet, try to fetch detalle (REST) or request state via WS
          if (!partida || !partida.jugadores || partida.jugadores.length === 0) {
            const jId = jugadorIdRef.current || jugadorIdState || undefined;
            if (jId) {
              try {
                // Intento REST inmediato (detalle) — preferible si el backend soporta /detalle
                const detalle = await partidaService.obtenerPartidaDetalle(codigo, jId as string);
                if (detalle) {
                  if (process.env.NODE_ENV === 'development') console.log('[usePartida] detalle fallback REST recibido tras subscribe');
                  setPartida(detalle);
                }
                // también solicitar estado por WS como redundancia
                websocketService.solicitarEstadoMultiple(codigo, jId);
                websocketService.aggressiveRegister(codigo, jId);
              } catch (e) {
                console.warn('[usePartida] Fallback obtenerPartidaDetalle falló:', e);
              }
            } else {
              // Si no hay jugadorId, pedir estado por WS (si el servidor implementa SOLICITAR_ESTADO)
              try {
                // solicitar sin jugadorId también
                websocketService.solicitarEstadoMultiple(codigo);
              } catch (e) {
                // ignore
              }
            }
          }
        } catch (e) {
          // ignore fallback errors
        }
      })();
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

