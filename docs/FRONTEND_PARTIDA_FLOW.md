## Frontend — Conexión y flujo de la partida (Next.js)

Este documento describe el flujo mínimo que el frontend (Next.js + React) debe implementar para integrarse con el backend en tiempo real.

Objetivos:
- Conectar por WebSocket/STOMP y registrar `jugadorId`.
- Suscribirse a los topics necesarios.
- Enviar eventos `drag` y recibir `CartaJugadaEvent`, `AtributoSeleccionadoEvent`, `RondaResueltaEvent`, `CardCountEvent` y `ServerErrorEvent`.

1) Conectar y registrar
- Conéctate al endpoint WebSocket (SockJS/STOMP). Tras conectar, envía un mensaje a `/app/partida/registrar` con el payload: `{ jugadorId, partidaCodigo }`.
- Suscríbete a:
  - `/topic/partida/{codigo}` — eventos principales (atributo seleccionado, carta jugada, ronda resuelta, transformaciones, partida iniciada, etc.)
  - `/topic/partida/{codigo}/counts` — `CardCountEvent` (conteos de cartas)
  - `/topic/partida/{codigo}/drag` — `PlayerDragEvent` (previews de arrastre)
  - `/user/queue/partida/{codigo}/errors` — `ServerErrorEvent` (mensajes de error dirigidos al jugador)

2) Mensajes recibidos clave
- `PartidaIniciadaEvent` => inicializa `turnoActual`, lista de jugadores y manos (si el backend provee códigos). Debes mapear códigos a objetos de carta con la cache local (o pedir `expand=true` al backend si existe).
- `AtributoSeleccionadoEvent` => muestra el atributo seleccionado en la UI (barrera para el drop: el primer jugador debe elegir atributo antes de dropear).
- `CartaJugadaEvent` => mostrar la carta en la mesa (jugador, nombre, código, imagen). Actualizar la vista de `mesa` con esta carta.
- `RondaResueltaEvent` => animar la resolución: mostrar ganador, mover cartas a la mano del ganador, limpiar mesa, actualizar `turnoActual` si corresponde.
- `CardCountEvent` => actualizar contadores de cartas por jugador; usar esto para la lógica de habilitar drag/mostrar orden.
- `PlayerDragEvent` => mostrar preview del drag (posición) para mejorar UX.
- `ServerErrorEvent` => mostrar notificación (toast/modal) con `message` cuando el servidor rechaza una jugada o acción.

3) Envíos desde frontend
- Para arrastrar y soltar: publica `PlayerDragEvent` a `/app/partida/{codigo}/drag`. Para drop en mesa, enviar `target: "mesa"` y `dragging: false`.
- Para seleccionar atributo: invocar el endpoint REST o RPC que el backend exponga (o usar un mapping STOMP si está implementado). El backend validará que el jugador es `turnoActual`.

4) Ejemplo mínimo de suscripción (pseudo TypeScript)

```ts
// after stompClient.connect
stompClient.send('/app/partida/registrar', {}, JSON.stringify({ jugadorId, partidaCodigo }));

stompClient.subscribe(`/topic/partida/${partidaCodigo}`, (msg) => handlePartidaEvent(JSON.parse(msg.body)));
stompClient.subscribe(`/topic/partida/${partidaCodigo}/counts`, (msg) => handleCounts(JSON.parse(msg.body)));
stompClient.subscribe(`/topic/partida/${partidaCodigo}/drag`, (msg) => handleDrag(JSON.parse(msg.body)));
stompClient.subscribe(`/user/queue/partida/${partidaCodigo}/errors`, (msg) => {
  const err = JSON.parse(msg.body);
  showToast(err.message || 'Error del servidor');
});
```

5) Recomendaciones
- Mostrar el avatar/etiqueta de "Su turno" en el jugador cuyo `id === turnoActual`.
- No permitir drag->drop en mesa si no eres el jugador esperado (ver `FRONTEND_TURN_HANDLER.md` para algoritmo exacto).
- No asumir éxito del drop; esperar `CartaJugadaEvent` para confirmar y actualizar la UI. Si llega `ServerErrorEvent`, revertir animaciones y mostrar mensaje.

---
Archivo relacionado: `FRONTEND_TURN_HANDLER.md` (lógica para habilitar drag/turnos) y `FRONTEND_MESA_RENDERING.md` (renderizado de mesa y animaciones).
