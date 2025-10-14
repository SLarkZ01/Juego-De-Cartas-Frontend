import api from '@/lib/api';
import type {
  Carta,
  PartidaResponse,
  PartidaDetailResponse,
  SeleccionarAtributoRequest,
  JugarCartaRequest,
  ActivarTransformacionRequest,
  DesactivarTransformacionRequest,
  TransformacionResponse,
} from '@/types/api';

/**
 * Servicio de Cartas
 * Maneja operaciones relacionadas con cartas del juego
 * Responsabilidad única: Gestión de cartas
 */
export class CartaService {
  /**
   * Obtener todas las cartas, opcionalmente filtradas por temática
   */
  async obtenerCartas(tematica?: string): Promise<Carta[]> {
    const params = tematica ? { tematica } : {};
    const response = await api.get<Carta[]>('/api/cartas', { params });
    return response.data;
  }

  /**
   * Obtener carta por código
   */
  async obtenerCartaPorCodigo(codigo: string): Promise<Carta> {
    const response = await api.get<Carta>(`/api/cartas/${codigo}`);
    return response.data;
  }

  /**
   * Sincronizar cartas desde API externa
   */
  async sincronizarCartas(): Promise<Carta[]> {
    const response = await api.post<Carta[]>('/api/cartas/sincronizar');
    return response.data;
  }
}

/**
 * Servicio de Partidas
 * Maneja operaciones relacionadas con la gestión de partidas
 * Responsabilidad única: Ciclo de vida de partidas
 */
export class PartidaService {
  /**
   * Crear nueva partida
   * El nombre del jugador se obtiene del usuario autenticado
   */
  async crearPartida(): Promise<PartidaResponse> {
    const response = await api.post<PartidaResponse>('/api/partidas/crear', {});
    return response.data;
  }

  /**
   * Unirse a partida existente
   * El nombre del jugador se obtiene del usuario autenticado
   */
  async unirsePartida(codigo: string): Promise<PartidaResponse> {
    const response = await api.post<PartidaResponse>(
      `/api/partidas/${codigo}/unirse`,
      {}
    );
    return response.data;
  }

  /**
   * Obtener información básica de la partida
   */
  async obtenerPartida(codigo: string): Promise<PartidaResponse> {
    const response = await api.get<PartidaResponse>(`/api/partidas/${codigo}`);
    return response.data;
  }

  /**
   * Obtener detalle completo de la partida para un jugador
   */
  async obtenerPartidaDetalle(
    codigo: string,
    jugadorId: string
  ): Promise<PartidaDetailResponse> {
    const response = await api.get<PartidaDetailResponse>(
      `/api/partidas/${codigo}/detalle`,
      {
        params: { jugadorId },
      }
    );
    return response.data;
  }

  /**
   * Iniciar partida
   */
  async iniciarPartida(codigo: string): Promise<void> {
    await api.post(`/api/partidas/${codigo}/iniciar`);
  }

  /**
   * Guardar el nuevo orden de la mano del jugador
   * El backend identifica al jugador por sesión/token
   * @param codigo Código de la partida
   * @param order Nuevo orden de la mano (array de IDs/códigos de carta)
   */
  async guardarOrdenMano(codigo: string, order: string[]): Promise<any> {
    const response = await api.post(`/api/partidas/${codigo}/mano/reorder`, { order });
    return response.data;
  }

  /**
   * Reconectar a una partida: marca al jugador como conectado en el servidor
   * Si se pasa jugadorId, se envía en el body; si no, el backend usará el token
   */
  async reconectarPartida(codigo: string, jugadorId?: string): Promise<PartidaResponse> {
    const body = jugadorId ? { jugadorId } : {};
    const response = await api.post<PartidaResponse>(`/api/partidas/${codigo}/reconectar`, body);
    return response.data;
  }

  /**
   * Salir de la partida (lobby) — el backend eliminará al jugador y publicará la partida actualizada
   */
  async salirPartida(codigo: string): Promise<void> {
    await api.post(`/api/partidas/${codigo}/salir`);
  }
}

/**
 * Servicio de Gameplay
 * Maneja acciones durante el juego
 * Responsabilidad única: Mecánicas de juego
 */
export class GameplayService {
  /**
   * Seleccionar atributo para la ronda
   */
  async seleccionarAtributo(
    codigo: string,
    data: SeleccionarAtributoRequest
  ): Promise<void> {
    await api.post(`/api/partidas/${codigo}/seleccionar-atributo`, data);
  }

  /**
   * Jugar carta en la ronda actual
   */
  async jugarCarta(codigo: string, data: JugarCartaRequest): Promise<void> {
    await api.post(`/api/partidas/${codigo}/jugar`, data);
  }

  /**
   * Activar transformación
   */
  async activarTransformacion(
    codigo: string,
    data: ActivarTransformacionRequest
  ): Promise<TransformacionResponse> {
    const response = await api.post<TransformacionResponse>(
      `/api/partidas/${codigo}/transformaciones/activar`,
      data
    );
    return response.data;
  }

  /**
   * Desactivar transformación
   */
  async desactivarTransformacion(
    codigo: string,
    data: DesactivarTransformacionRequest
  ): Promise<TransformacionResponse> {
    const response = await api.post<TransformacionResponse>(
      `/api/partidas/${codigo}/transformaciones/desactivar`,
      data
    );
    return response.data;
  }
}

// Exportar instancias singleton
export const cartaService = new CartaService();
export const partidaService = new PartidaService();
export const gameplayService = new GameplayService();

// Exportar función directa para el hook
export const guardarOrdenMano = partidaService.guardarOrdenMano.bind(partidaService);
