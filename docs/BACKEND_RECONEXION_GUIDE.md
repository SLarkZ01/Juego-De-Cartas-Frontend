# Guía para backend: Reconexión WebSocket robusta (Spring Boot)

Objetivo
-------
Evitar condiciones de carrera en la reconexión de jugadores tras recarga/navegación: cuando un cliente recarga la página estando dentro de una partida, el servidor debe garantizar que el jugador no quede marcado como "desconectado" si el cliente reaparece, y debe publicar el estado canónico de la partida (PartidaResponse) de forma que todos los suscriptores vean la lista actualizada.

Resumen de la solución
-----------------------
1. Mantener un mapping sessionId -> jugadorId cuando el cliente publica a `/app/partida/registrar`.
2. Cuando la sesión WebSocket se desconecta, programar un "grace" timeout (configurable, por defecto 5s) para marcarla desconectada; si durante ese tiempo llega un registro (POST /reconectar o `/app/partida/registrar`) para ese jugador, cancelar la tarea y mantenerlo conectado.
3. Implementar `POST /api/partidas/{codigo}/reconectar` que marque el jugador conectado (por jugadorId o por token JWT) y que publique inmediatamente el `PartidaResponse` actualizado a `/topic/partida/{codigo}`.
4. Detectar suscripciones a `/topic/partida/{codigo}` y publicar el estado canónico inmediatamente (ya implementado, pero verificar idempotencia y rendimiento).

Archivos/Clases a tocar (Spring)
--------------------------------
- `PartidaWebSocketController` (controlador STOMP /app/partida/**)
  - Exponer `/app/partida/registrar` para recibir `{ jugadorId, partidaCodigo }` y guardar el mapping sessionId->jugadorId. Debe retornar OK.
- `WebSocketEventListener` (listener de sesiones/suscripciones)
  - `SessionSubscribeEvent` -> detecta suscripción a `/topic/partida/{codigo}` y publica `PartidaResponse`.
  - `SessionDisconnectEvent` -> programa task de grace (5s) para marcar desconexión; guarda manejador para poder cancelarlo.
- `PartidaService` / `PartidaRepository` (servicios de dominio)
  - Métodos para marcar jugador conectado/desconectado, cancelar tareas y obtener `PartidaResponse`.
- `ReconexionRestController` (nuevo endpoint)
  - POST `/api/partidas/{codigo}/reconectar` (opcional body `{ jugadorId }`) que fuerza marcado `jugador.conectado = true` y publica `PartidaResponse`.

Snippets sugeridos
------------------
1) Mapping sessionId -> jugadorId y cancelación de grace

```java
// Concurrent maps para tracking
private final Map<String, String> sessionToJugador = new ConcurrentHashMap<>();
private final Map<String, ScheduledFuture<?>> disconnectTasks = new ConcurrentHashMap<>();
private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);

// Cuando recibes el mensaje STOMP /app/partida/registrar
public void registrarJugador(String sessionId, String codigo, String jugadorId) {
  sessionToJugador.put(sessionId, jugadorId);
  // Si hay una tarea de desconexión pendiente para ese jugador, cancelarla
  ScheduledFuture<?> pending = disconnectTasks.remove(jugadorId);
  if (pending != null) pending.cancel(false);

  // Marcar jugador como conectado en la entidad Partida
  partidaService.marcarConectado(codigo, jugadorId);
  // Publicar estado canónico inmediatamente
  simpMessagingTemplate.convertAndSend("/topic/partida/" + codigo, partidaService.buildPartidaResponse(codigo));
}

// Cuando detectas SessionDisconnectEvent
public void onSessionDisconnect(SessionDisconnectEvent event) {
  String sessionId = event.getSessionId();
  String jugadorId = sessionToJugador.remove(sessionId);
  if (jugadorId == null) return; // no estaba registrado

  // Programar desconexión diferida (grace period)
  ScheduledFuture<?> future = scheduler.schedule(() -> {
    partidaService.marcarDesconectado(jugadorId);
    // publicar estado
    simpMessagingTemplate.convertAndSend("/topic/partida/" + codigo, partidaService.buildPartidaResponse(codigo));
    disconnectTasks.remove(jugadorId);
  }, 5, TimeUnit.SECONDS);

  disconnectTasks.put(jugadorId, future);
}
```

Notes:
- Usa `jugadorId` como clave para disconnectTasks porque múltiples sesiones pueden mapear al mismo jugador en edge cases; si el jugador tiene otra session activa, cancelar la tarea.
- Guarda también mapping sessionId -> partidaCodigo si necesitas reconstruir cuál partida afecta.

2) Endpoint REST `reconectar`

```java
@PostMapping("/api/partidas/{codigo}/reconectar")
public ResponseEntity<PartidaResponse> reconectar(@PathVariable String codigo, @RequestBody(required=false) Map<String,String> body, Principal principal) {
  String jugadorId = body != null ? body.get("jugadorId") : null;
  if (jugadorId == null) {
    // intentar resolver mediante principal (token JWT -> usuario -> jugador en la partida)
    jugadorId = partidaService.resolveJugadorIdFromPrincipal(codigo, principal.getName());
  }
  if (jugadorId == null) return ResponseEntity.badRequest().build();

  // Cancelar cualquier tarea de desconexión pendiente
  ScheduledFuture<?> pending = disconnectTasks.remove(jugadorId);
  if (pending != null) pending.cancel(false);

  partidaService.marcarConectado(codigo, jugadorId);
  PartidaResponse resp = partidaService.buildPartidaResponse(codigo);
  simpMessagingTemplate.convertAndSend("/topic/partida/" + codigo, resp);
  return ResponseEntity.ok(resp);
}
```

3) Suscripción a topic: publicar estado inmediato

```java
@EventListener
public void handleSessionSubscribeEvent(SessionSubscribeEvent event) {
  // extrae destination de headers, si coincide con /topic/partida/{codigo} entonces:
  String codigo = extractCodigoFromDestination(...);
  PartidaResponse resp = partidaService.buildPartidaResponse(codigo);
  simpMessagingTemplate.convertAndSend("/topic/partida/" + codigo, resp);
}
```

Edge cases y recomendaciones
----------------------------
- Doble-mapping: si tienes múltiples tabs con la misma sesión/jugador, usa una estructura que permita contar sesiones activas por jugador (ref-count) y solo marcar desconectado cuando el contador llegue a 0.
- Concurrency: usa estructuras thread-safe (`ConcurrentHashMap`) y sincronización en `PartidaService` para evitar condiciones en actualizar `jugadores[].conectado`.
- Idempotencia: publicar estado canónico cada vez es idempotente (mismo payload), pero evita publicar demasiado frecuentemente — agrupa cambios rápidos si tu sistema lo soporta.
- Configuración: puedes ajustar el periodo de gracia cambiando la propiedad Spring `app.disconnect.graceSeconds` (valor en segundos). Por ejemplo, en `application.properties`:

```
app.disconnect.graceSeconds=5
```

- Logging: añade logs detallados en `registrarJugador`, `onDisconnect` y en el endpoint `reconectar` con sessionId/jugadorId/codigo para facilitar debugging.
- Telemetría: opcionalmente emite métricas cuando ocurra cancelación de grace vs desconexión definitiva para detectar flujos problemáticos.

Checklist QA (pruebas manuales)
-------------------------------
1. Crear partida en A.
2. En A, abrir DevTools, recargar la página. Verificar que POST /api/partidas/{codigo}/reconectar se llame (si el cliente lo hace) y que el servidor publique `PartidaResponse` y que la UI no muestre "desconectado".
3. Unirse con B: verificar que A reciba `JUGADOR_UNIDO` o `PartidaResponse` y que la lista se actualice.
4. Recarga rápida en A: recargar varias veces en <5s y verificar que no aparece como desconectado (grace cancels).
5. Simular red lento: ralentizar red para ver si registro STOMP llega después; si POST /reconectar es llamado y funciona, la UI debe recuperarse.

Mensajes para el backend Copilot
--------------------------------
- Implementa `POST /api/partidas/{codigo}/reconectar` que acepte opcional `{ jugadorId }` y publique el `PartidaResponse` actualizado.
- Implementa `PartidaWebSocketController` handler para `/app/partida/registrar` que guarde mapping sessionId->jugadorId y cancele tareas de desconexión pendientes.
- En `WebSocketEventListener`, al desconectar, programa una tarea de 5s (configurable) para marcar desconectado; si llega reconexión o `registrar` antes de 5s, cancela la tarea.
- Publica `PartidaResponse` inmediatamente al detectar `SessionSubscribeEvent` en `/topic/partida/{codigo}`.

Si quieres, preparo el PR con los cambios Java (borradores de clases) o un patch más detallado con el código listo para pegar en el backend.

---

Estado del TODO
----------------
- `Escribir guía backend reconexión (MD)`: in-progress -> completado (este archivo)
- `Agregar snippets y edge cases`: completado dentro de este mismo MD (incluí snippets y casos borde)
- `Probar y QA checklist`: completado dentro del MD (lista de pruebas)

Si quieres, ahora:
- Puedo generar un PR con archivos Java esqueleto listos (WebSocketEventListener, PartidaWebSocketController, ReconexionRestController) para que el Copilot del backend lo convierta en código completo, o
- Puedo añadir más ejemplos (p. ej. uso de Redis para persistir mapping) si el backend necesita tolerar reinicios.

Dime cómo quieres que proceda.