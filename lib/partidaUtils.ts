/**
 * Utilidades para manejo de jugadorId y lógica común de partidas
 */
export function persistJugadorId(codigo: string, jugadorId: string | undefined | null) {
  if (!codigo || !jugadorId) return;
  try {
    localStorage.setItem(`jugadorId_${codigo}`, jugadorId);
  } catch (e) {
    console.warn('[partidaUtils] No se pudo persistir jugadorId en localStorage', e);
  }
}

export function readJugadorId(codigo: string): string | undefined {
  try {
    return localStorage.getItem(`jugadorId_${codigo}`) || undefined;
  } catch (e) {
    console.warn('[partidaUtils] No se pudo leer jugadorId de localStorage', e);
    return undefined;
  }
}

export function isAlreadyInError(message: string | undefined | null): boolean {
  if (!message) return false;
  return /ya est|ya estás|ya estas|already/i.test(message);
}

export async function obtenerPartidaDetalleWithRetries(partidaService: any, codigo: string, jugadorId: string | undefined, attempts = 3, baseDelay = 200) {
  if (!jugadorId) return null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const detalle = await partidaService.obtenerPartidaDetalle(codigo, jugadorId);
      if (detalle) return detalle;
    } catch (e) {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, baseDelay * attempt));
  }
  return null;
}
