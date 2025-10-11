# Salir de Partida (Frontend)

Este documento explica cómo implementar en el frontend la acción "salir de la partida" en el lobby y cómo se comporta el backend en tiempo real.

## Resumen

- Endpoint REST (POST): `/api/partidas/{codigo}/salir`
- Cuando un jugador sale antes de que la partida inicie, el backend:
  - Elimina al jugador de la lista de jugadores de la partida.
  - Reordena los `orden` de los jugadores para que sean secuenciales (1..N).
  - Publica el estado actualizado de la partida en el topic STOMP: `/topic/partida/{codigo}` con un `PartidaResponse` (lista actualizada de jugadores y `jugadorId` en caso aplique).

## Flujo recomendado (cliente)

1. Mantén conectada la suscripción STOMP al topic `/topic/partida/{codigo}` (ver `docs/SOLUCION_LOBBY_JUGADORES.md` para ejemplos de suscripción). El servidor publicará inmediatamente la nueva `PartidaResponse` cuando alguien se una o salga.

2. Cuando el usuario haga click en "Salir":
   - Llama al endpoint POST `/api/partidas/{codigo}/salir` (sin body).
   - Si la llamada retorna 200, no es necesario más: la suscripción STOMP recibirá la actualización y deberías actualizar la UI.
   - Si la llamada retorna un error (404/400), mostrar un mensaje apropiado al usuario.

### Ejemplo (fetch + STOMP)

```javascript
// Llamada para salir
async function salirPartida(partidaCodigo) {
  const res = await fetch(`/api/partidas/${partidaCodigo}/salir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include' // si el backend usa cookies/sesión
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.mensaje || 'Error saliendo de la partida');
  }

  // No es necesario procesar el body; la actualización llegará por WebSocket.
}

// Suscripción STOMP (resumida)
client.subscribe(`/topic/partida/${codigo}`, (msg) => {
  const partidaResp = JSON.parse(msg.body);
  // Actualiza la lista de jugadores en tu UI con partidaResp.jugadores
});
```

## Consideraciones

- Autenticación: El endpoint usa el usuario autenticado para identificar qué jugador sale. Si el cliente conoce `jugadorId`, hay una variante interna del servidor `salirPartidaPorJugadorId` utilizada por WebSocket/servicios, pero no expuesta públicamente.

- Consistencia: Se usan locks por jugador (`playerSyncService`) en el backend para evitar race conditions. Si dos clientes intentan modificar la misma partida al mismo tiempo (por ejemplo, uno sale y otro se une), el backend maneja sincronización y publicará el estado final.

- Reconexión: Si un jugador que salió se reconecta, deberá usar el endpoint de unirse o reconectar según el flujo del frontend.

- Mensajes STOMP: El payload enviado al topic `/topic/partida/{codigo}` es el `PartidaResponse` tal como lo usa el resto del frontend. Asegúrate de manejar `jugadores` y `jugadorId`.

## Pruebas manuales recomendadas

1. Abrir dos clientes (navegadores) suscritos al mismo `codigo`.
2. En uno de ellos, presionar "Salir".
3. Verificar que el otro cliente reciba la actualización por STOMP y actualice la lista inmediatamente.
4. Verificar que la petición REST retorne 200.

---

Si quieres, puedo añadir un snippet específico para el frontend actual (Next.js + STOMP) o actualizar la `GUIA_INTEGRACION_NEXTJS.md` con el ejemplo adaptado.
