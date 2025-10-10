const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

export async function crearPartida(nombreJugador: string) {
  const res = await fetch(`${API_URL}/partidas/crear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombreJugador }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Error desconocido' }));
    throw new Error(err.message || 'Error al crear partida');
  }

  return res.json();
}

export async function unirsePartida(codigo: string, nombreJugador: string) {
  const res = await fetch(`${API_URL}/partidas/${codigo}/unirse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombreJugador }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Error desconocido' }));
    throw new Error(err.message || 'Error al unirse a la partida');
  }

  return res.json();
}

export async function obtenerPartidaDetalle(codigo: string, jugadorId: string) {
  const res = await fetch(`${API_URL}/partidas/${codigo}/detalle?jugadorId=${encodeURIComponent(jugadorId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Error desconocido' }));
    throw new Error(err.message || 'Error al obtener detalle de la partida');
  }

  return res.json();
}

export async function jugarCarta(codigo: string, jugadorId: string) {
  const res = await fetch(`${API_URL}/partidas/${codigo}/jugar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jugadorId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Error desconocido' }));
    throw new Error(err.message || 'Error al jugar carta');
  }

  return res.status;
}
