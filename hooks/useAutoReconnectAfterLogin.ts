import { useRouter } from 'next/navigation';

export async function tryAutoReconnectAfterLogin(router: ReturnType<typeof useRouter>) {
  try {
    const resp = await fetch('/api/partidas/reconectar-automatica', { method: 'POST' });
    if (resp.status === 200) {
      const partida = await resp.json();
      if (partida?.codigo) {
        // Guardar y redirigir a la partida detectada
        try {
          localStorage.setItem(`jugadorId_${partida.codigo}`, partida.jugadorId);
          localStorage.setItem('jugadorId', partida.jugadorId);
          localStorage.setItem('partidaCodigo', partida.codigo);
        } catch (e) {
          console.warn('[tryAutoReconnectAfterLogin] No se pudo persistir en localStorage', e);
        }
        router.push(`/partida/${partida.codigo}`);
        return true;
      }
    }
  } catch (err) {
    console.error('[tryAutoReconnectAfterLogin] Error intentando reconexión automática:', err);
  }
  return false;
}
