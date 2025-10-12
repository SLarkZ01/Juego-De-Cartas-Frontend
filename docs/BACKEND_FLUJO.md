# Flujo Backend (WebSocket, REST y Orden de Juego)

Este documento resume cómo funciona el backend del juego en tiempo real, qué APIs REST están disponibles y el orden de juego que debe respetar el frontend. Está pensado como guía para implementar el cliente (Next.js o cualquier frontend) y garantizar interoperabilidad con la lógica de servidor.

## Resumen de canales en tiempo real

- Endpoint STOMP (WebSocket) base: `ws://<host>:<port>/ws` (configurar según tu entorno). Los clientes envían al prefijo `/app` y se suscriben a `/topic`.
- Topic principal por partida: `/topic/partida/{codigo}` — el servidor publica eventos relacionados con la partida.
- Message mappings (clientes envían a):
  - `/app/partida/registrar` — informar `jugadorId` y opcional `partidaCodigo` para asociar sesión.
  - `/app/partida/{codigo}/accion` — enviar acciones de juego (WS): `SELECCIONAR_ATRIBUTO`, `JUGAR_CARTA`, `ACTIVAR_TRANSFORMACION`, `DESACTIVAR_TRANSFORMACION`, `SOLICITAR_ESTADO`.

## Eventos WebSocket (publicados en `/topic/partida/{codigo}`)

Todos los eventos heredan de `BaseGameEvent` con `tipo` y `timestamp`.

- `JugadorUnidoEvent` — cuando un jugador se une a la partida (usualmente publicado por `PartidaService` cuando alguien hace POST `/unirse`).
- `PartidaEstadoEvent` (tipo `PARTIDA_ESTADO`) — contiene `PartidaDetailResponse` para sincronizar todo el estado (útil cuando un cliente solicita estado o al suscribirse).
- `PartidaIniciadaEvent` (tipo `PARTIDA_INICIADA`) — notifica inicio de la partida, primer turno (`turnoActual`) y `tiempoLimiteSegundos`.
- `AtributoSeleccionadoEvent` (tipo `ATRIBUTO_SELECCIONADO`) — quién seleccionó el atributo y qué atributo.
- `CartaJugadaEvent` (tipo `CARTA_JUGADA`) — emitido cada vez que un jugador juega una carta. Incluye `jugadorId`, `nombreJugador`, `codigoCarta`, `nombreCarta`, `imagenCarta`.
- `RondaResueltaEvent` (tipo `RONDA_RESUELTA`) — emitido cuando se resuelve una ronda; contiene `ganadorId` (o `null` si hay empate), `atributoUsado`, `valorGanador`, listado `resultados` con la carta y valor de cada jugador, y `empate`.
- `JuegoFinalizadoEvent` (tipo `JUEGO_FINALIZADO`) — cuando la partida finaliza (ganador o empate).
- `ErrorEvent` (tipo `ERROR`) — para reportar errores operativos o de validación en respuesta a acciones WebSocket.
- `PartidaResponse` (DTO publicado en `/topic/partida/{codigo}` por `WebSocketEventListener` y `PartidaService`) — contiene `codigo`, `jugadorId` y `jugadores` (lista). Ahora incluye `eliminada` cuando la partida es eliminada (creador sale en lobby).

## Endpoints REST importantes

Base: `/api/partidas`
- POST `/api/partidas/crear` — crea partida; devuelve `PartidaResponse` con `codigo` y `jugadorId` del creador.
- POST `/api/partidas/{codigo}/unirse` — unirse a una partida (devuelve `PartidaResponse` actualizado y publica en WS).
- GET `/api/partidas/{codigo}` — obtener info básica.
- GET `/api/partidas/{codigo}/detalle?jugadorId=...` — detalle privado para un jugador (cartas en mano, etc.).
- POST `/api/partidas/{codigo}/reconectar` — marca al jugador como conectado y publica estado.
- POST `/api/partidas/{codigo}/salir` — el jugador autenticado sale del lobby:
  - Si es el creador y partida está `EN_ESPERA` -> servidor publica `PartidaResponse{eliminada:true}` y borra la partida.
  - Si no es el creador -> elimina jugador, reordena y publica `PartidaResponse` normal.
- POST `/api/partidas/{codigo}/iniciar` — inicia la partida (llama internamente a `GameService.iniciarPartida`) — valida jugadores y reparte cartas.
- POST `/api/partidas/{codigo}/seleccionar-atributo` — REST alternativa para seleccionar atributo (también se puede por WS).
- POST `/api/partidas/{codigo}/jugar` — REST alternativa para jugar carta (también se puede por WS).

## Orden y reglas de juego (cómo implementarlo en el frontend)

1. Lobby
   - Flujos: crear partida -> unirse -> esperar jugadores.
   - Suscribirse a `/topic/partida/{codigo}` inmediatamente tras conectarse para recibir el `PartidaResponse` actual (el `WebSocketEventListener` publica el estado al suscribirse).
   - Para salir del lobby, llamar POST `/api/partidas/{codigo}/salir`. Si eres creador, la partida puede ser eliminada y se recibirá `eliminada: true`.

2. Inicio de la partida
   - Cualquier cliente (usualmente el creador) llama POST `/api/partidas/{codigo}/iniciar`.
   - Cuando el servidor inicia la partida publica `PartidaIniciadaEvent` con `turnoActual`.
   - El frontend debe actualizar su estado: `estado = EN_CURSO`, `turnoActual` y `tiempoLimite`.

3. Turnos y selección de atributo
   - El jugador cuyo `jugadorId` coincide con `turnoActual` es quien debe seleccionar el atributo de la ronda.
   - Selección se hace por WS enviando a `/app/partida/{codigo}/accion` con `accion=SELECCIONAR_ATRIBUTO`, `jugadorId` y `atributo`.
   - Tras validar el servidor publica `AtributoSeleccionadoEvent` y actualiza `Partida` en BD.

4. Jugar cartas
   - Cada jugador que tenga cartas en mano debe jugar cuando el servidor/turnos lo indique (en este juego se espera que todos los jugadores activos jueguen en cada ronda).
   - El cliente envía `accion=JUGAR_CARTA` por WS a `/app/partida/{codigo}/accion` (o POST `/api/partidas/{codigo}/jugar` si prefieres REST).
   - Al jugar, el servidor publica `CartaJugadaEvent` con los datos de la carta para que el UI la muestre en la mesa.
   - Cuando todos los jugadores activos han jugado, el servidor resuelve la ronda automáticamente con `RondaResueltaEvent`.

5. Resolver ronda
   - `RondaResueltaEvent` incluye:
     - `ganadorId` (null si empate), `atributoUsado`, `valorGanador`, lista de resultados por jugador y `empate` boolean.
   - Si hay empate, las cartas se acumulan en `cartasAcumuladasEmpate` y se mantiene el turno actual hasta resolverse.
   - Si hay ganador, el ganador recibe las cartas jugadas (más cartas acumuladas por empate si las hubiera) y el turno pasa al ganador.
   - El servidor publica `RondaResueltaEvent`, y actualiza `Partida` en BD con la nueva mano de cada jugador.

6. Fin de juego
   - El servidor detecta fin si:
     - Solo queda un jugador con cartas -> `JuegoFinalizadoEvent` con ganador.
     - Llegó límite de tiempo -> compara cantidad de cartas y determina ganador o empate.
   - Frontend debe escuchar `JuegoFinalizadoEvent` para mostrar resultados y todo el historial si es necesario.

## Reconexiones y desconexiones

- WebSocketEventListener:
  - Asocia `sessionId -> jugadorId` cuando el cliente se registra (método `/app/partida/registrar` o `registrarJugadorEnPartida`).
  - Al desconectar, programa una desconexión diferida (`disconnectGraceService.scheduleDisconnect`) con una ventana de gracia (por defecto 5s). Si el jugador reconecta durante la gracia, `disconnectGraceService.cancel(jugadorId)` evita marcarlo desconectado.
  - Si la desconexión se materializa, el backend marca `jugador.conectado = false` y publica un `PartidaResponse` con la lista actualizada.
- El cliente al reconectarse debe llamar POST `/api/partidas/{codigo}/reconectar` (o enviar `/app/partida/registrar` con `jugadorId` y `partidaCodigo`) para ser marcado como conectado y recibir el estado actualizado.

## Mensajes de error y validación

- Si la acción enviada vía WS no es válida o el jugador no puede realizarla (no es su turno, atributo no seleccionado, jugador sin cartas, etc.), el servidor publica `ErrorEvent` con `mensaje` y `codigo` de error (p.ej. `VALIDATION_ERROR`, `STATE_ERROR`). El cliente debe mostrar estos errores de forma contextual.

## Recomendaciones para el frontend

- Mantener suscripción STOMP persistente y reintentar reconexiones automáticas con backoff.
- Al suscribirse a `/topic/partida/{codigo}`: actualizar UI con `PartidaResponse` (lista de jugadores) y esperar eventos (`PARTIDA_INICIADA`, `CARTA_JUGADA`, `RONDA_RESUELTA`, `JUEGO_FINALIZADO`).
- Mostrar indicadores de "conectado"/"desconectado" usando `jugador.conectado` en `PartidaResponse`.
- Implementar control de turnos en UI: habilitar acciones (seleccionar atributo, jugar carta) sólo si `jugadorId === turnoActual` o si la UI lo requiere.
- Manejar `eliminada: true` en `PartidaResponse` para cerrar lobbies cuando el creador cancela la partida.

## Ejemplo mínimo de secuencia (resumen)

1. Crear partida (REST) -> recibe `PartidaResponse` con `codigo`.
2. Conectar WS, subscribirse a `/topic/partida/{codigo}`.
3. Otros jugadores hacen POST `/unirse` -> reciben `PartidaResponse` por WS.
4. Creador llama POST `/iniciar` -> servidores reparten y publican `PartidaIniciadaEvent`.
5. Jugador turnoActual envía `SELECCIONAR_ATRIBUTO` por WS.
6. Todos los jugadores envían `JUGAR_CARTA` por WS.
7. Servidor publica `RondaResueltaEvent` -> UI actualiza manos y turno.
8. Repetir hasta `JuegoFinalizadoEvent`.

---

Si quieres, adapto este documento para incluir ejemplos concretos de implementación en Next.js (hook/react + STOMP client) y snippets de manejo de reconexión. ¿Lo quieres integrado en `GUIA_INTEGRACION_NEXTJS.md` o como un archivo nuevo?  

He dejado la tarea `docs/BACKEND_FLUJO.md` como completada. Continuo según tu preferencia.   
