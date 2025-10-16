# Jugar carta por índice desde el frontend — guía completa

Este documento explica cómo el frontend debe aprovechar la nueva capacidad del backend para jugar la carta seleccionada por el usuario usando `cardIndex` en el `PlayerDragEvent`.

Contexto rápido
- El backend ahora acepta, en `PlayerDragEvent`, el campo `cardIndex` (índice 0-based en la mano del jugador) cuando se hace drop en la mesa. Si se envía, el servidor usará esa carta (removerá la carta en esa posición de la mano) en lugar de quitar siempre la primera.
- Si `cardIndex` no se envía, el comportamiento cae al flujo antiguo (se toma la carta en índice 0).

Objetivos del frontend
- Incluir `cardIndex` correcto en el evento de drop para que la carta que el usuario arrastra sea la que se juegue.
- Manejar condiciones de carrera (índice desactualizado) y errores devueltos por el servidor.
- Mantener la experiencia fluida con actualizaciones optimistas y reconciliación usando `PartidaResponse`.

Suscripciones que debes mantener
- `/topic/partida/{codigo}` — PartidaResponse, CartaJugadaEvent, RondaResueltaEvent, TurnoCambiadoEvent.
- `/topic/partida/{codigo}/drag` — previews de drag (opcional).
- `/topic/partida/{codigo}/counts` — CardCountEvent (opcional).
- `/user/queue/partida/{codigo}/errors` — ServerErrorEvent (rechazos del servidor).

Payload esperado para drop (PlayerDragEvent)
```json
{
  "jugadorId": "<miId>",
  "jugadorNombre": "<miNombre>",
  "dragging": false,
  "cardIndex": 3,         // índice 0-based en la mano del jugador
  "target": "mesa"
}
```

Ejemplo (React + TypeScript) — enviar drop con cardIndex
```ts
import type { Client } from '@stomp/stompjs';

type PlayerDragEvent = {
  jugadorId: string;
  jugadorNombre?: string;
  dragging: boolean;
  cardIndex?: number;
  target?: string;
};

function sendDrop(stompClient: Client, partidaCodigo: string, jugadorId: string, cardIndex: number) {
  const event: PlayerDragEvent = {
    jugadorId,
    dragging: false,
    cardIndex,
    target: 'mesa'
  };

  stompClient.publish({
    destination: `/app/partida/${partidaCodigo}/drag`,
    body: JSON.stringify(event)
  });
}
```

Dónde sacar `cardIndex`
- Si usas react-beautiful-dnd o similar, el índice lo obtienes de `source.index` en el callback `onDragEnd`.
- Si tu UI permite reorder visual, asegúrate de enviar el índice que corresponde a la representación actual en pantalla.

Problemas de concurrencia y cómo manejarlos
- Riesgo: entre que el usuario inicia el drag y el servidor procesa el evento, la mano pudo haber cambiado (otro jugador jugó o hubo reconexión). En ese caso el backend rechazará la jugada con `ServerErrorEvent`.

Recomendaciones para robustez:
1) Validación local (opcional): antes de publicar, validar que `cardIndex` está dentro de bounds de la mano actual.
2) Persistencia previa (opcional, robusto): llamar a `POST /api/partidas/{codigo}/mano/reorder` para establecer el orden definitivo en el backend (útil si el usuario reordenó su mano y quieres que eso sea persistente). Después de la respuesta OK, enviar el drop. Ventaja: reduce desincronizaciones entre pestañas/conexiones.
3) Manejo de errores: suscribirse a `/user/queue/partida/{codigo}/errors` para recibir `ServerErrorEvent`. Mostrar un toast y re-sincronizar con `PartidaResponse`.

Ejemplo de flujo en `onDragEnd` (pseudo-código)
```ts
async function onDragEnd(result) {
  if (!result.destination) return; // no drop
  if (result.destination.droppableId !== 'mesa') return;

  const cardIndex = result.source.index; // índice en la mano visual

  // (opcional) persistir nuevo orden si el usuario movió cartas antes
  // await fetch(`/api/partidas/${codigo}/mano/reorder`, ...)

  // Enviar drop con cardIndex
  sendDrop(stompClient, partidaCodigo, myJugadorId, cardIndex);

  // Opcional: aplicar actualización optimista en UI (quitar carta localmente)
}
```

Cómo reaccionar al `ServerErrorEvent`
- Mostrar un feedback claro (toast modal) con el `message` recibido.
- Re-sincronizar estado: fuerza una solicitud o espera al próximo `PartidaResponse` para reparar la UI.

Optimismo y reconciliación
- Puedes quitar la carta optimísticamente de la mano local para dar sensación de inmediatez. Pero siempre mantén la suscripción a `PartidaResponse` como fuente de verdad. Si recibes `ServerErrorEvent`, revierte la acción optimista (o recarga la mano desde `PartidaResponse`).

Alternativa: enviar `cardCode` en vez de `cardIndex`
- Opcionalmente el frontend puede enviar el código único de la carta (p. ej. `DB_2C`), y el backend podría aceptar `cardCode` en lugar de `cardIndex` (esto no está implementado por defecto aquí, pero es una variante que podemos añadir si prefieres trabajar con IDs en vez de índices). Ventaja: índice no se desincroniza si el orden local cambió; desventaja: revela el código de carta si no quieres hacerlo por privacidad.

Testing recomendado (smoke tests)
1. Caso feliz:
   - Usuario arrastra carta en índice 2 y hace drop: la carta jugada en la mesa debe coincidir con la carta en índice 2 de la mano (verificar en DB o CardJugadaEvent payload).
2. Índice inválido:
   - Enviar index > size-1 y verificar que recibes `ServerErrorEvent` y la UI se reconcilia.
3. Concurrencia:
   - Simular dos jugadores que juegan rápido y verificar que los rechazos se manejan y que las manos se sincronizan.

Notas finales
- Esta implementación permite al frontend un control fino sobre qué carta se juega sin necesidad de cambiar la semántica del servidor (que antes tomaba siempre la carta en la posición 0).
- Si prefieres que el backend acepte `cardCode` en lugar de índices, puedo implementarlo: dime y lo cambio.

---
Archivo creado para guiar la integración frontend del cambio `cardIndex`.
