# Frontend Copilot: Manejo de Turnos y Recuento de Cartas (TURNO_CAMBIADO + CARD_COUNTS)

Objetivo

- Dar al Copilot del frontend una guía completa y práctica para implementar la UI/UX reactiva al flujo de turnos y recuento de cartas del backend.
- Incluir ejemplos de payloads, pseudocódigo (React + STOMP), casos borde, checklist de tests, y recomendaciones de rendimiento y UX.

Resumen del backend

- Endpoints WebSocket (STOMP/SockJS):
  - `/topic/partida/{codigo}` — eventos de estado/mesa (PARTIDA_STATE, CARTA_JUGADA, RONDA_RESUELTA, TURNO_CAMBIADO, ...).
  - `/topic/partida/{codigo}/counts` — eventos `CARD_COUNTS` con recuentos de cartas por jugador.
- Eventos relevantes (campos clave):
  - `CARTA_JUGADA`:
    - jugadorId, nombreJugador, codigoCarta, nombreCarta, imagenCarta
  - `TURNO_CAMBIADO`:
    - expectedPlayerId, expectedPlayerNombre, alreadyPlayed (lista o booleano por jugador)
  - `RONDA_RESUELTA`:
    - ganadorId (nullable si empate), nombreGanador, atributoUsado, valorGanador, resultados[], empate(boolean)
  - `CARD_COUNTS`:
    - counts: [{ jugadorId, nombre, count, orden }]

Diseño general para el frontend

1) Modelo de datos en el cliente

- `partidaState` (objeto completo sincronizado al suscribirse / al reconectar). Contiene: jugadores, mano del usuario, cartasEnMesa, turnoActual, atributoSeleccionado, etc.
- `counts` (mapa jugadorId -> count) actualizado por `/counts`.
- `stompConnected` (boolean) y `lastSequence` (opcional) para reconciliación si se necesita.

2) Suscripciones STOMP recomendadas

- Conectar STOMP/SockJS cuando el usuario entra en la sala (o vuelve a la página).
- Suscribirse a:
  - `/topic/partida/{codigo}` — recibir eventos de mesa y estado.
  - `/topic/partida/{codigo}/counts` — recibir `CARD_COUNTS` (actualiza contadores visuales).
- Al reconectar: solicitar el estado completo (si la app tiene endpoint REST: `GET /partida/{codigo}` o confiar en `PARTIDA_STATE` enviado al suscribirse; backend ya publica `PARTIDA_STATE` al suscribirse). El cliente debe usar `PARTIDA_STATE` para reconciliar cualquier evento perdido.

3) Manejo de `TURNO_CAMBIADO` (UX)

- Objetivo UX: que el jugador local sepa inmediatamente si es su turno y se bloqueen controles en caso contrario.

Comportamiento:
- Al recibir `TURNO_CAMBIADO`:
  - Actualizar `partidaState.turnoActual = expectedPlayerId` (si no se gestiona desde PARTIDA_STATE).
  - Si `expectedPlayerId === miJugadorId`: marcar UI como "mi turno" -> habilitar controles de jugar/seleccionar atributo.
  - Si `expectedPlayerId !== miJugadorId`: deshabilitar controles de juego, y mostrar indicador visual (p.ej. "Turno de X").
  - Mostrar `alreadyPlayed` para atenuar avatars/jugadores que ya jugaron.

- Mensajes de ayuda para el jugador activo: si `alreadyPlayed` contiene al menos su id -> mostrar "Ya jugaste" (si el juego lo permite).

4) Manejo de `CARD_COUNTS`

- `CARD_COUNTS` llega por separado y suele ser más ligero. Actualizar un estado local `countsMap` con la lista recibida.
- No reemplazar `partidaState.jugadores[x].count` hasta confirmar consistencia con `PARTIDA_STATE` (opcional). Si confías en counts como fuente primaria para la UI del contador, actualiza inmediatamente.
- Actualizaciones UI recomendadas: contadores en avatares, animación pequeña (fade/scale) cuando cambia el número, evitar re-render completo de la mesa.

5) Manejo de `CARTA_JUGADA` y `RONDA_RESUELTA`

- `CARTA_JUGADA`:
  - Mostrar la carta en la mesa (pequeña animación desde avatar -> centro).
  - Si eres espectador o jugador remoto: no remover la carta de tu mano local hasta que el backend envíe `PARTIDA_STATE` o `CARD_COUNTS` confirme la nueva cantidad. Evita que la UI asuma resultados sin confirmación del backend.

- `RONDA_RESUELTA`:
  - Si `empate == true`: mostrar overlay de empate, esperar la resolución automática del backend.
  - Si hay `ganadorId`: reproducir animación de entrega de cartas y actualizar `counts`/`partidaState` tras el evento.

6) Reconciliación y estrategia anti-perdida de eventos

- Estrategia simple y robusta:
  1. Mantén `PARTIDA_STATE` como fuente de la verdad.
  2. Consume eventos incrementalmente (CARTA_JUGADA, TURNO_CAMBIADO, CARD_COUNTS) para mejorar latencia y UX.
  3. En reconexión o cuando detectes desincronía (p.ej. tu contador local difiere del `counts` recibido en más de 2), recarga `PARTIDA_STATE` y refresca UI.

7) Pseudocódigo React + STOMP (hook reutilizable)

- Componentes sugeridos:
  - `usePartidaSocket({ codigo, onUpdate })` — hook que gestiona conexión, suscripciones y parsing de eventos.
  - `PartidaView` — usa hook y renderiza mesa, jugadores, contadores y controles.

Pseudocódigo (simplificado):

```js
// usePartidaSocket pseudocode
function usePartidaSocket(codigo, miJugadorId) {
  const [connected, setConnected] = useState(false);
  const [partidaState, setPartidaState] = useState(null);
  const [counts, setCounts] = useState(new Map());

  useEffect(() => {
    const stomp = connectStomp(`/ws`, {
      onConnect: () => {
        setConnected(true);
        stomp.subscribe(`/topic/partida/${codigo}`, msg => handleMain(msg));
        stomp.subscribe(`/topic/partida/${codigo}/counts`, msg => handleCounts(msg));
      },
      onDisconnect: () => setConnected(false)
    });

    return () => stomp.disconnect();
  }, [codigo]);

  function handleMain(message) {
    const ev = JSON.parse(message.body);
    switch(ev.type) {
      case 'PARTIDA_STATE':
        setPartidaState(ev.payload);
        break;
      case 'CARTA_JUGADA':
        // aplicar cambio ligero: añadir carta en mesa
        patchStateWithCardPlayed(ev.payload);
        break;
      case 'TURNO_CAMBIADO':
        setPartidaState(prev => ({...prev, turnoActual: ev.payload.expectedPlayerId}));
        setAlreadyPlayed(ev.payload.alreadyPlayed);
        break;
      case 'RONDA_RESUELTA':
        // mostrar animación y luego pedir estado completo si es necesario
        requestFullStateIfNeeded();
        break;
      default:
        break;
    }
  }

  function handleCounts(message) {
    const ev = JSON.parse(message.body);
    const map = new Map(ev.counts.map(c => [c.jugadorId, c.count]));
    setCounts(map);
  }

  return {connected, partidaState, counts};
}
```

8) Checklist de UX y tests (frontend)

- Tests unitarios:
  - Simular recibir `TURNO_CAMBIADO` y verificar que los controles se habilitan/deshabilitan correctamente.
  - Simular recibir `CARD_COUNTS` y verificar que los contadores de la UI se actualizan.

- Tests e2e (Cypress/Puppeteer):
  - Dos clientes conectados: jugador A y B. A juega carta -> B recibe `CARTA_JUGADA` y `TURNO_CAMBIADO` -> B puede jugar.
  - Reconexión: desconectar B, A juega 2 rondas, reconectar B -> B solicita/recibe `PARTIDA_STATE` y su UI concuerda con estado actual.

- Edge cases a testear:
  - Empates: recibir `RONDA_RESUELTA` con `empate=true`.
  - Jugador con 0 cartas: UI debe mostrar "El jugador ya no tiene cartas" y deshabilitar acciones.
  - Mensajes duplicados: idempotencia en el manejo de `CARTA_JUGADA` (si llega dos veces, no duplicar la carta en mesa).

9) Recomendaciones de rendimiento y coste

- `CARD_COUNTS` es liviano y pensado para actualizaciones frecuentes; suscribir y renderizar solo la parte de UI que muestra los badges de contadores.
- Evitar re-render de la mesa completa por cada `CARD_COUNTS`; usar memoización o render por componente de jugador.

10) Resumen de integración rápida (3 pasos)

1. Implementar `usePartidaSocket` que se suscribe a `/topic/partida/{codigo}` y `/topic/partida/{codigo}/counts`.
2. Actualizar `PartidaView` para usar `counts` como fuente para los badges de jugador y `TURNO_CAMBIADO` para controlar habilitación de acciones.
3. Añadir tests unitarios + e2e que simulen dos clientes para verificar la experiencia completa.


---

Notas finales

- Si quieres, puedo generar el hook real (archivo React/TypeScript) y tests de ejemplo (Jest + React Testing Library + un pequeño mock de STOMP) para integrar rápidamente con tu frontend. Indícame si prefieres JavaScript o TypeScript y el framework exacto (React + Next.js, versión), y lo creo.
