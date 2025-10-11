// ============================================================================
// Authentication Types
// ============================================================================

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  username: string; // Puede ser username o email
  password: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
  username: string;
  email: string;
}

// ============================================================================
// Carta Types
// ============================================================================

export interface Transformacion {
  nombre: string;
  imagen?: string;
  ki?: string;
}

export interface Planeta {
  nombre: string;
  imagen?: string;
  descripcion?: string;
  isDestroyed?: boolean;
}

export interface Carta {
  id?: string;
  codigo: string;
  nombre: string;
  imagenUrl?: string;
  atributos?: Record<string, number>;
  tematica?: string;
  paquete?: number;
  descripcion?: string;
  raza?: string;
  genero?: string;
  afiliacion?: string;
  planeta?: Planeta;
  transformaciones?: Transformacion[];
}

// ============================================================================
// Partida Types
// ============================================================================

export interface JugadorInfo {
  id: string;
  nombre: string;
}

export interface PartidaResponse {
  codigo: string;
  jugadorId: string;
  jugadores: JugadorInfo[];
}

export interface CrearPartidaRequest {
  // Vacío - el nombre se obtiene del usuario autenticado
}

export interface UnirsePartidaRequest {
  // Vacío - el nombre se obtiene del usuario autenticado
}

// ============================================================================
// Game Types
// ============================================================================

export interface JugadorPublic {
  id: string;
  nombre: string;
  numeroCartas: number;
  orden: number;
  conectado: boolean;
}

export interface JugadorPrivate {
  id: string;
  nombre: string;
  cartasEnMano: string[];
  cartaActual?: string;
  numeroCartas: number;
  transformacionActiva?: string;
  indiceTransformacion?: number;
}

export interface PartidaDetailResponse {
  codigo: string;
  jugadorId: string;
  estado: EstadoPartida;
  turnoActual?: string;
  atributoSeleccionado?: string;
  jugadores: JugadorPublic[];
  miJugador: JugadorPrivate;
  tiempoRestante?: number;
}

export enum EstadoPartida {
  ESPERANDO = 'ESPERANDO',
  EN_CURSO = 'EN_CURSO',
  FINALIZADA = 'FINALIZADA',
}

export interface SeleccionarAtributoRequest {
  jugadorId: string;
  atributo: string;
}

export interface JugarCartaRequest {
  jugadorId: string;
}

// ============================================================================
// Transformacion Types
// ============================================================================

export interface ActivarTransformacionRequest {
  jugadorId: string;
  indiceTransformacion: number;
}

export interface DesactivarTransformacionRequest {
  jugadorId: string;
}

export interface TransformacionResponse {
  jugadorId: string;
  nombreJugador?: string;
  nombreTransformacion?: string | null;
  indiceTransformacion: number;
  multiplicador: number;
  mensaje: string;
  exitoso: boolean;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export enum AccionWebSocket {
  SELECCIONAR_ATRIBUTO = 'SELECCIONAR_ATRIBUTO',
  JUGAR_CARTA = 'JUGAR_CARTA',
  ACTIVAR_TRANSFORMACION = 'ACTIVAR_TRANSFORMACION',
  DESACTIVAR_TRANSFORMACION = 'DESACTIVAR_TRANSFORMACION',
  SOLICITAR_ESTADO = 'SOLICITAR_ESTADO',
}

export interface WsActionRequest {
  accion: AccionWebSocket;
  jugadorId: string;
  atributo?: string;
  indiceTransformacion?: number;
}

export enum TipoEventoWs {
  JUGADOR_UNIDO = 'JUGADOR_UNIDO',
  JUGADOR_DESCONECTADO = 'JUGADOR_DESCONECTADO',
  PARTIDA_INICIADA = 'PARTIDA_INICIADA',
  TURNO_CAMBIADO = 'TURNO_CAMBIADO',
  ATRIBUTO_SELECCIONADO = 'ATRIBUTO_SELECCIONADO',
  CARTA_JUGADA = 'CARTA_JUGADA',
  RONDA_COMPLETADA = 'RONDA_COMPLETADA',
  PARTIDA_FINALIZADA = 'PARTIDA_FINALIZADA',
  TRANSFORMACION_ACTIVADA = 'TRANSFORMACION_ACTIVADA',
  TRANSFORMACION_DESACTIVADA = 'TRANSFORMACION_DESACTIVADA',
  ERROR = 'ERROR',
  ESTADO_ACTUALIZADO = 'ESTADO_ACTUALIZADO',
}

export interface EventoWebSocket {
  tipo: TipoEventoWs;
  codigoPartida: string;
  timestamp: string;
  datos?: any;
  mensaje?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export interface ErrorResponse {
  status: number;
  error: string;
  message: string;
  path?: string;
  timestamp?: string;
}

// ============================================================================
// Partida Model (Complete)
// ============================================================================

export interface Jugador {
  id: string;
  nombre: string;
  cartasEnMano: string[];
  cartaActual?: string;
  numeroCartas: number;
  orden: number;
  conectado: boolean;
  transformacionActiva?: string;
  indiceTransformacion?: number;
}

export interface CartaEnMesa {
  jugadorId: string;
  carta: Carta;
  atributoSeleccionado?: string;
  valorAtributo?: number;
}

export interface Partida {
  id: string;
  codigo: string;
  estado: EstadoPartida;
  jugadores: Jugador[];
  cartasEnMesa: CartaEnMesa[];
  turnoActual?: string;
  atributoSeleccionado?: string;
  ganador?: string;
  tiempoLimite?: number;
}
