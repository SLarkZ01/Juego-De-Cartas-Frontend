# Guía Frontend: cargar las cartas de cada jugador al iniciar la partida

Esta guía explica, paso a paso, cómo el cliente (Next.js/React) debe suscribirse a los topics WebSocket y cargar las cartas privadas del jugador cuando la partida comienza.

Objetivos:
- Detectar el inicio de la partida en tiempo real.
- Obtener las cartas privadas del jugador (sin revelar a otros).
- Actualizar la UI con la mano del jugador y los conteos públicos.
- Manejar reconexiones y race conditions.

Resumen de flujo (alto nivel):
1. Cliente se conecta al servidor STOMP (/ws) y se suscribe a:
   - `/topic/partida/{codigo}`         — estado general (PartidaIniciadaEvent, PartidaResponse)
   - `/topic/partida/{codigo}/counts`  — CardCountEvent (conteo de cartas)
   - `/topic/partida/{codigo}/drag`    — PlayerDragEvent (preview de arrastre)
2. Cliente registra su `jugadorId` enviando un mensaje a `/app/partida/registrar` con `{ jugadorId, partidaCodigo }`.
3. Cuando se recibe `PartidaIniciadaEvent` en `/topic/partida/{codigo}`:
   - Hacer una petición REST: `GET /api/partidas/{codigo}/detalle?jugadorId={jugadorId}`.
   - En la respuesta (`PartidaDetailResponse`) obtendrás `miJugador.cartasEnMano` y `miJugador.cartaActual` (privado).
   - Actualizar el estado local con la mano del jugador.
4. El servidor también publicará `CardCountEvent` en `/topic/partida/{codigo}/counts`. Usarlo para mostrar el número de cartas de los demás jugadores.

---

## Qué debe hacer el frontend al presionar "Iniciar Partida"

Esta sección especifica el comportamiento recomendado en el cliente cuando el creador (o un jugador autorizado) pulsa el botón "Iniciar Partida" en la UI.

Objetivos del flujo cliente al iniciar:
- Evitar que el cliente se pierda eventos WS (suscribirse antes de iniciar).
- Registrar la sesión para que el servidor asocie `sessionId` -> `jugadorId`.
- Invocar el endpoint que inicia la partida y mostrar feedback al usuario.
- Esperar los eventos que confirmen el inicio y obtener la mano privada por REST.

Secuencia recomendada (paso a paso):
1. Preparar la UI: deshabilitar temporalmente el botón "Iniciar Partida" y mostrar un spinner/loader.
2. Asegurarse de que la conexión STOMP está activa y que el cliente está suscrito a los topics:
   - `/topic/partida/{codigo}`
   - `/topic/partida/{codigo}/counts`
   - `/topic/partida/{codigo}/drag`
3. Publicar el registro de la sesión al servidor (para mapear session -> jugador):
   - SEND `/app/partida/registrar` con body `{ jugadorId, partidaCodigo }`.
4. (Opcional pero recomendado) Realizar una petición GET `/api/partidas/{codigo}/detalle?jugadorId={jugadorId}` para sincronizar el estado antes de iniciar (esto cubre casos de reconexión tardía).
5. Llamar al endpoint que inicia la partida:
   - POST `/api/partidas/{codigo}/iniciar` (incluye headers de auth si aplica).
6. Esperar la confirmación por WebSocket:
   - Esperar `PartidaIniciadaEvent` en `/topic/partida/{codigo}`. Cuando llegue:
     - Llamar `GET /api/partidas/{codigo}/detalle?jugadorId={jugadorId}` para obtener la mano privada.
     - Actualizar UI con `miJugador.cartasEnMano` y `miJugador.cartaActual`.
     - Actualizar conteos públicos con el siguiente `CardCountEvent` (o usar el que llega justo después).
7. Si el POST a `/iniciar` falla (4xx/5xx), mostrar error y re-habilitar el botón. Si el POST responde 200 pero no llega el `PartidaIniciadaEvent` en 1-2 segundos, reintentar el GET `/detalle` (posible race en persistencia).
8. Cuando se recibe `PartidaResponse` con `eliminada === true` en `/topic/partida/{codigo}`, el cliente debe cerrar la sala y mostrar mensaje final.

Ejemplo de implementación (TypeScript / React - flujo simplificado):

```ts
async function handleStartGame() {
  setStarting(true);
  try {
    // 1) Asegurar suscripciones y registro
    if (!stompClient.connected) await stompClient.activate();
    stompClient.publish({ destination: '/app/partida/registrar', body: JSON.stringify({ jugadorId, partidaCodigo: codigo }) });

    // 2) (opcional) sincronizar estado antes de iniciar
    await fetch(`/api/partidas/${codigo}/detalle?jugadorId=${jugadorId}`, { headers: authHeaders });

    // 3) Llamar al endpoint iniciar
    const resp = await fetch(`/api/partidas/${codigo}/iniciar`, { method: 'POST', headers: authHeaders });
    if (!resp.ok) throw new Error('No se pudo iniciar la partida: ' + resp.status);

    // 4) esperar PartidaIniciadaEvent que nos permitirá pedir la mano privada
    // El handler onPartidaMessage debe detectar 'PARTIDA_INICIADA' y llamar al GET /detalle
  } catch (err) {
    // mostrar error al usuario
    console.error(err);
    setStarting(false);
  }
}
```

Notas de UX y seguridad:
- Solo el creador debería poder ver/activar el botón "Iniciar Partida" (la UI debe ocultarlo para otros). El backend realiza la validación mínima (por ejemplo: suficiente jugadores, estado EN_ESPERA) y rechazará la petición si no corresponde.
- Mostrar mensajes claros: "Esperando al resto de jugadores...", "Iniciando partida...", y errores si la acción falla.

---

## Contexto backend: cómo se inicia una partida (resumen técnico)

Para que el frontend entienda qué ocurre en el servidor cuando se inicia la partida, aquí está el flujo resumido y los puntos que debe conocer:

- Endpoint REST que inicia la partida:
  - `POST /api/partidas/{codigo}/iniciar` (implementado en `GameController` que delega a `GameService.iniciarPartida(codigo)`).

- Validaciones realizadas por el backend:
  - La partida debe existir y estar en estado `EN_ESPERA`.
  - Debe haber al menos 2 jugadores (o la regla que se defina).
  - Si la partida ya está `EN_CURSO` o `FINALIZADA`, el endpoint retornará error.

- Pasos que ejecuta `GameService.iniciarPartida(codigo)` (resumen):
  1. Recupera todas las cartas (`cartaRepository.findAll()`), extrae sus códigos.
  2. Genera y baraja la baraja (`deckService.generarBaraja(codigos)`).
  3. Reparte las cartas con `deckService.repartir(partida, baraja)` — reparto round-robin: la i-ésima carta va al jugador i % jugadores.
  4. Actualiza `numeroCartas` y `cartaActual` para cada jugador.
  5. Establece `estado = EN_CURSO` y `tiempoInicio`.
  6. Determina `turnoActual` usando `deckService.determinarPrimerTurno(partida)` (basado en prioridad de códigos).
  7. Persiste la `Partida` en la base (`partidaRepository.save(p)`).

- Eventos publicados tras iniciar (importante para el frontend):
  - `PartidaIniciadaEvent` publicado en `/topic/partida/{codigo}` — notifica a todos que la partida se inició y quién tiene el primer turno.
  - `CardCountEvent` publicado en `/topic/partida/{codigo}/counts` — lista de jugadores con su `numeroCartas` (privacidad: no contiene cartas privadas).

- Recomendación para el frontend basada en el comportamiento del backend:
  - No esperar que `PartidaIniciadaEvent` contenga la mano privada; el frontend debe solicitarla vía `GET /api/partidas/{codigo}/detalle?jugadorId=...`.
  - Manejar la posibilidad de pequeños delays entre la publicación del evento y la persistencia completa: reintentar el GET `/detalle` si la respuesta inicial no contiene las cartas esperadas.


Por qué pedir el detalle por REST y no incluir las cartas en el evento WS:
- Privacidad: los eventos de broadcast no deben contener las cartas privadas de cada jugador.
- Consistencia: el endpoint REST devuelve la vista privada (mi mano) y es idempotente.
- Robustez: permite reenviar la información si el cliente se conectó tarde o perdió algunos mensajes.

---

## Endpoints y Topics relevantes
- REST
  - GET /api/partidas/{codigo}/detalle?jugadorId={jugadorId}  => `PartidaDetailResponse`
- STOMP (WebSocket)
  - SUBSCRIBE `/topic/partida/{codigo}`      => `PartidaIniciadaEvent` o `PartidaResponse`
  - SUBSCRIBE `/topic/partida/{codigo}/counts` => `CardCountEvent`
  - SUBSCRIBE `/topic/partida/{codigo}/drag`   => `PlayerDragEvent`
  - SEND `/app/partida/registrar` (payload: `ReconectarRequest`) para asociar sessionId -> jugadorId en servidor


## Estructuras importantes (resumen)
- PartidaIniciadaEvent:
  - eventType: "PARTIDA_INICIADA" (campo `event` implícito por DTO)
  - turnoActual: string (jugadorId del turno)
  - nombreJugadorTurno: string
  - tiempoLimiteSegundos: number

- PartidaDetailResponse (interesantes):
  - jugadoresPublicos: lista de jugadores (sin `cartasEnMano`)
  - miJugador: objeto que incluye `cartasEnMano: string[]` y `cartaActual` (privado)

- CardCountEvent: lista de { jugadorId, nombre, count, orden }

---

## Ejemplo práctico: Hook `useGameSync` (Next.js + React)

Descripción: hook que
- abre conexión STOMP
- registra el jugador
- se suscribe a los topics
- cuando llega `PartidaIniciadaEvent` llama al endpoint detalle
- expone el estado (mano, cartaActual, counts, conectado)

Resumen del hook (pseudocódigo / TypeScript):

- Inputs:
  - codigo: string (código de la partida)
  - jugadorId: string (id del jugador actual)
  - token: string (opcional, para autenticación con fetch)

- Estado devuelto:
  - mano: string[]
  - cartaActual: string | null
  - counts: Record<jugadorId, number>
  - conectado: boolean
  - conectar() / desconectar()

Implementación (ideas concretas):
- Usar `@stomp/stompjs` y `sockjs-client` o `stompjs` puro.
- Reconexión automática: configurar `reconnectDelay`.
- Manejo de mensajes: validar campos antes de actuar.

Puntos claves del código (extracto):

1) Conexión y registro
```ts
// crear client STOMP
const client = new Client({
  brokerURL: wsUrl, // si usas SockJS, usa webSocketFactory
  reconnectDelay: 2000,
  onConnect: () => {
    // enviar registro para mapear session -> jugador
    client.publish({destination: '/app/partida/registrar', body: JSON.stringify({ jugadorId, partidaCodigo: codigo })});

    // suscribirse a topics
    client.subscribe(`/topic/partida/${codigo}`, onPartidaMessage);
    client.subscribe(`/topic/partida/${codigo}/counts`, onCountsMessage);
    client.subscribe(`/topic/partida/${codigo}/drag`, onDragMessage);
  }
});
client.activate();
```

2) Al recibir PartidaIniciadaEvent
```ts
async function onPartidaMessage(frame) {
  const payload = JSON.parse(frame.body);
  if (payload.event && payload.event === 'PARTIDA_INICIADA') {
    // pedir detalle privado
    const detalle = await fetch(`/api/partidas/${codigo}/detalle?jugadorId=${jugadorId}`, { headers: authHeaders });
    const data = await detalle.json();

    // data.miJugador.cartasEnMano => usar para setear mano local
    setMano(data.miJugador.cartasEnMano || []);
    setCartaActual(data.miJugador.cartaActual || null);
  }
}
```

3) Manejo de CardCountEvent (actualizar números visibles)
```ts
function onCountsMessage(frame) {
  const payload = JSON.parse(frame.body);
  if (payload && payload.counts) {
    const map = {};
    for (const j of payload.counts) map[j.jugadorId] = j.count;
    setCounts(map);
  }
}
```

4) Recomendada: peticiones fallidas y reintentos
- Si el `GET /detalle` falla (429 o 5xx), reintentar 1-2 veces con backoff exponencial corto.
- Si la mano viene vacía en un `PartidaIniciadaEvent`, volver a solicitar el detalle (posible race entre evento y persistencia).

---

## Manejo de corner-cases y race conditions
- Caso: el cliente se suscribe tarde (después del `PartidaIniciadaEvent`) — solución: al conectarse, siempre pedir `GET /api/partidas/{codigo}/detalle?jugadorId=...` para sincronizar el estado actual, además de escuchar eventos.
- Caso: el `PartidaIniciadaEvent` se publica pero la DB todavía no tiene la mano persistida (rare) — solución: reintentar el GET con 200ms-500ms delays (2-3 veces).
- Caso: reconexión rápida — el servidor tiene `disconnectGraceService` para evitar marcar desconectado inmediatamente; aun así, el cliente debe reenviar `/app/partida/registrar` al reconectarse.

---

## Ejemplo minimal HTML de prueba (sin Next.js)
Guarda como `scripts/test-ws.html` (puedo generarla si quieres). Usa stomp.js y sockjs para abrir varias pestañas y probar.

---

## Recomendaciones finales y buenas prácticas
- No confiar en eventos broadcast para obtener datos privados.
- El cliente debe validar el tipo de payload en cada topic.
- Evitar lógica que cierre la UI por mensajes en subtopics; sólo reacciona a `PartidaResponse.eliminada === true` en el topic principal.
- Mantener logs en `onConnect`, `onDisconnect`, y en los handlers de mensajes para depurar fácilmente.

---

Si quieres, genero el hook TypeScript completo, el HTML de prueba y/o ejemplos de componentes React listos para copiar en tu frontend. ¿Cuál prefieres que genere ahora?