## Frontend — Sincronizar panel de jugadores (esquina superior izquierda)

Objetivo: actualizar en tiempo real la lista de jugadores, sus contadores de cartas, estado de conexión y quién tiene el turno, usando los eventos publicados por el backend.

Eventos relevantes publicados por el backend:
- `/topic/partida/{codigo}` — ahora se publican `PartidaResponse` además de eventos como `CartaJugadaEvent` y `RondaResueltaEvent`.
- `/topic/partida/{codigo}/counts` — `CardCountEvent` (lista de { jugadorId, nombre, count, orden }).

Estrategia recomendada:
1. Suscribirse a `/topic/partida/{codigo}` y procesar `PartidaResponse` para sincronizar la vista completa de jugadores. Esta es la fuente de verdad para el panel.
2. Suscribirse a `/topic/partida/{codigo}/counts` para actualizaciones rápidas de conteos si deseas optimizar. Sin embargo, `PartidaResponse` contiene `jugadores` con `numeroCartas` también.
3. Escuchar `CartaJugadaEvent` y `RondaResueltaEvent` para animaciones y actualizaciones visuales en la mesa; pero no reemplazan `PartidaResponse` para los números/turno.

Implementación (React + TypeScript)

Hook: `usePartidaPanelSync`

```ts
import { useEffect, useState, useCallback } from 'react';

type JugadorPanel = {
  id: string;
  nombre: string;
  numeroCartas: number;
  orden: number;
  conectado: boolean;
};

export function usePartidaPanelSync(stompClient: any, partidaCodigo: string, myJugadorId?: string) {
  const [jugadores, setJugadores] = useState<JugadorPanel[]>([]);
  const [turnoActual, setTurnoActual] = useState<string | null>(null);

  const handlePartidaMessage = useCallback((msg: any) => {
    const body = JSON.parse(msg.body);
    // PartidaResponse shape: { codigo, jugadorId, jugadores: Jugador[] }
    if (body && body.jugadores) {
      const parsed = body.jugadores.map((j: any) => ({
        id: j.id,
        nombre: j.nombre,
        numeroCartas: j.numeroCartas || j.getNumeroCartas ? j.getNumeroCartas() : j.numeroCartas,
        orden: j.orden,
        conectado: j.conectado
      }));
      setJugadores(parsed);
      // If backend also sends turn info inside the PartidaResponse (not always), update it
      if ((body as any).turnoActual) setTurnoActual((body as any).turnoActual);
    }
  }, []);

  const handleCounts = useCallback((msg: any) => {
    const body = JSON.parse(msg.body);
    if (!body || !body.counts) return;
    setJugadores(prev => {
      const map = new Map(prev.map(p => [p.id, p]));
      for (const c of body.counts) {
        const existing = map.get(c.jugadorId);
        if (existing) {
          existing.numeroCartas = c.count;
        }
      }
      return Array.from(map.values()).sort((a,b) => a.orden - b.orden);
    });
  }, []);

  useEffect(() => {
    if (!stompClient || !partidaCodigo) return;

    const subPartida = stompClient.subscribe(`/topic/partida/${partidaCodigo}`, handlePartidaMessage);
    const subCounts = stompClient.subscribe(`/topic/partida/${partidaCodigo}/counts`, handleCounts);

    return () => {
      try { subPartida.unsubscribe(); } catch (e) {}
      try { subCounts.unsubscribe(); } catch (e) {}
    };
  }, [stompClient, partidaCodigo, handlePartidaMessage, handleCounts]);

  // Helper: find expected player from turnoActual + jugadores con cartas (same algorithm as backend expectation)
  const expectedPlayerId = useCallback(() => {
    if (!turnoActual || jugadores.length === 0) return null;
    const activos = jugadores.filter(j => j.numeroCartas > 0).sort((a,b)=>a.orden - b.orden);
    if (activos.length === 0) return null;
    const start = activos.findIndex(p => p.id === turnoActual);
    if (start === -1) return null;
    // We don't know cartasEnMesa here; frontend should track cartasEnMesa via CartaJugadaEvent
    // For display purposes ("who should play next"), you can use cartasEnMesa.length if tracked
    return activos[0].id; // fallback: mostraremos el primer jugador del orden como referencia
  }, [turnoActual, jugadores]);

  return { jugadores, setJugadores, turnoActual, setTurnoActual, expectedPlayerId };
}
```

Ejemplo de componente `PlayersPanel`

```tsx
function PlayersPanel({ stompClient, partidaCodigo, myJugadorId }) {
  const { jugadores, turnoActual } = usePartidaPanelSync(stompClient, partidaCodigo, myJugadorId);

  return (
    <div className="players-panel">
      {jugadores.map(j => (
        <div key={j.id} className={`player-item ${j.id === turnoActual ? 'turno' : ''}`}>
          <div className="avatar">{j.nombre.charAt(0)}</div>
          <div className="meta">
            <div className="name">{j.nombre} {j.id === myJugadorId ? '(Tú)' : ''}</div>
            <div className="count">{j.numeroCartas} cartas</div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

Notas adicionales
- Si quieres que el panel también muestre quién es el `expectedPlayer` (el que debe jugar en la posición actual), el frontend debe mantener `cartasEnMesa.length` y usar el algoritmo de `FRONTEND_TURN_HANDLER.md` para calcular el índice `alreadyPlayed` y obtener `expectedPlayer` desde la lista rotada.
- Si el frontend necesita CSS/UX más rico (badges "Su turno", indicadores de reconexión), usa `PartidaResponse` para obtener `conectado` y `orden` y renderiza en consecuencia.
