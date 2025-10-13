import type { PartidaDetailResponse } from '@/types/api';

/**
 * Utilidades para manejo de jugadorId y lógica común de partidas
 */
export function persistJugadorId(codigo: string, jugadorId: string | undefined | null) {
  if (!codigo || !jugadorId) return;
  try {
    localStorage.setItem(`jugadorId_${codigo}`, jugadorId);
  } catch {
    console.warn('[partidaUtils] No se pudo persistir jugadorId en localStorage');
  }
}

export function readJugadorId(codigo: string): string | undefined {
  try {
    return localStorage.getItem(`jugadorId_${codigo}`) || undefined;
  } catch {
    console.warn('[partidaUtils] No se pudo leer jugadorId de localStorage');
    return undefined;
  }
}

export function isAlreadyInError(message: string | undefined | null): boolean {
  if (!message) return false;
  return /ya est|ya estás|ya estas|already/i.test(message);
}

type PartidaServiceLike = { obtenerPartidaDetalle: (codigo: string, jugadorId: string) => Promise<PartidaDetailResponse | null> };

export async function obtenerPartidaDetalleWithRetries(partidaService: PartidaServiceLike, codigo: string, jugadorId: string | undefined, attempts = 3, baseDelay = 200): Promise<PartidaDetailResponse | null> {
  if (!jugadorId) return null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const detalle = await partidaService.obtenerPartidaDetalle(codigo, jugadorId);
      if (detalle) return detalle;
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, baseDelay * attempt));
  }
  return null;
}
