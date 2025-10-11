'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { partidaService, gameplayService } from '@/services/partida.service';
import { websocketService } from '@/lib/websocket';
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

  /**
   * Crear nueva partida
   */
  const crearPartida = useCallback(async (): Promise<PartidaResponse> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await partidaService.crearPartida();
      jugadorIdRef.current = response.jugadorId;
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
      jugadorIdRef.current = response.jugadorId;
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
    const jId = jugadorId || jugadorIdRef.current;
    if (!jId) {
      setError('ID de jugador no disponible');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const detalle = await partidaService.obtenerPartidaDetalle(codigo, jId);
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
        if (evento.tipo === 'ESTADO_ACTUALIZADO' && evento.datos) {
          setPartida((prev) => {
            if (!prev) return evento.datos as PartidaDetailResponse;
            return {
              ...prev,
              ...evento.datos,
            } as PartidaDetailResponse;
          });
        } else if (evento.tipo === 'JUGADOR_UNIDO' && evento.datos) {
          // Actualizar lista de jugadores cuando alguien se une
          setPartida((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              jugadores: evento.datos.jugadores || prev.jugadores,
            };
          });
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
    jugadorId: jugadorIdRef.current,
    
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
    setJugadorId: (id: string) => {
      jugadorIdRef.current = id;
    },
  };
}

