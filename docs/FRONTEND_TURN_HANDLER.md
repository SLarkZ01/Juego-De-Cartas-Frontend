## Frontend — Turn handler y cuándo habilitar drag->drop

Este documento explica el algoritmo que el frontend debe seguir para saber cuándo permitir que un jugador dropee su carta en la mesa.

Premisa: El servidor es la fuente de verdad. El frontend debe usar `turnoActual`, `CardCountEvent` y el estado local de `cartasEnMesa` (evento `CartaJugadaEvent`) para calcular el jugador esperado.

Conceptos clave:
- `turnoActual` (string): id del jugador que inicia la ronda.
- `orderedPlayers`: lista de jugadores activos ordenada por `orden` y rotada para comenzar desde `turnoActual`.
- `cartasEnMesaCount`: número de cartas actualmente en la mesa (según eventos `CartaJugadaEvent`).

Algoritmo (resumen):
1. Mantén en estado:
   - `players` (lista con {id, nombre, orden, count}) actualizada por `CardCountEvent`.
   - `turnoActual` actualizado por `PartidaIniciadaEvent` o `RondaResueltaEvent`.
   - `cartasEnMesa` array actualizado por `CartaJugadaEvent` y limpiado por `RondaResueltaEvent`.
2. Calcular jugadores activos: `players.filter(p => p.count > 0)` y ordenarlos por `orden`.
3. Rotar la lista para que el primer elemento sea `turnoActual`.
4. `expectedPlayer = ordered[(cartasEnMesa.length) % ordered.length]`.
5. Habilitar drag->drop (mesa) solo si `currentPlayerId === expectedPlayer.id` y (si `cartasEnMesa.length === 0`) sólo si `atributoSeleccionado` ya fue notificado por `AtributoSeleccionadoEvent`.

Snippet TypeScript (React hook)

```ts
function useTurnHandler({ players, turnoActual, cartasEnMesa, atributoSeleccionado }) {
  const currentPlayerId = getMyPlayerId();

  const expectedPlayerId = React.useMemo(() => {
    const activos = players.filter(p => p.count > 0).sort((a,b) => a.orden - b.orden);
    if (activos.length === 0) return null;
    // rotar
    const start = activos.findIndex(p => p.id === turnoActual);
    if (start === -1) return null;
    const ordered = Array.from({length: activos.length}, (_,i) => activos[(start + i) % activos.length]);
    return ordered[cartasEnMesa.length % ordered.length]?.id;
  }, [players, turnoActual, cartasEnMesa.length]);

  const canDropToMesa = React.useMemo(() => {
    if (!currentPlayerId || !expectedPlayerId) return false;
    if (currentPlayerId !== expectedPlayerId) return false;
    if (cartasEnMesa.length === 0 && !atributoSeleccionado) return false; // first play must have attribute
    return true;
  }, [currentPlayerId, expectedPlayerId, cartasEnMesa.length, atributoSeleccionado]);

  return { expectedPlayerId, canDropToMesa };
}
```

Notas:
- `players` se actualiza desde `CardCountEvent`.
- `cartasEnMesa` se construye con los `CartaJugadaEvent` (no confiar en la UI local exclusivamente).
- Si el servidor envía un `ServerErrorEvent` tras intentar jugar, revertir la animación de drop.
