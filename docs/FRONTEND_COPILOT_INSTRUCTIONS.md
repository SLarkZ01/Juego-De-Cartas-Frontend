# Guía para Copilot del frontend — cómo aplicar cardIndex y manejar TurnoCambiadoEvent

Este documento está pensado para el copilot/IA que genera código del frontend (Next.js/React). Contiene instrucciones concretas, snippets y checklist para aplicar correctamente el nuevo comportamiento del backend (soporte de `cardIndex` y `TurnoCambiadoEvent`).

Objetivos concretos
- Enviar `cardIndex` en el `PlayerDragEvent` cuando ocurra un drop a la mesa.
- Suscribirse a `/topic/partida/{codigo}` y procesar `TurnoCambiadoEvent` para habilitar la interacción del jugador correcto.
- Manejar `ServerErrorEvent` en `/user/queue/partida/{codigo}/errors`.
- Mantener `PartidaResponse` como fuente de verdad y reconciliar estado.

1) Mensaje de drop: `PlayerDragEvent` con `cardIndex`
- Estructura:
```json
{
  "jugadorId": "<miId>",
  "jugadorNombre": "<miNombre>",
  "dragging": false,
  "cardIndex": <indice 0-based>,
  "target": "mesa"
}
```

- Recomendación para Copilot: si el proyecto usa `react-beautiful-dnd`, extrae `source.index` en `onDragEnd` y úsalo como `cardIndex`.

Snippet (Copilot-ready, TypeScript):
```ts
// onDragEnd handler
function onDragEnd(result) {
  # Guía para Copilot (frontend) — integrar cardIndex, TurnoCambiadoEvent y PARTIDA_STATE

  Este documento está pensado como una guía práctica y precisa para un Copilot/IA que va a generar o modificar código frontend (Next.js/React + STOMP). Incluye payloads esperados, reglas de suscripción, snippets TypeScript/React y pasos de debugging.

  Resumen rápido
  - Suscribirse a `/topic/partida/{codigo}` (y opcionalmente `/topic/partida/{codigo}/counts`).
  - El backend publica varios tipos de mensajes en el mismo topic. El cliente debe discriminar por el campo `tipo` y actuar en consecuencia.
  - Cuando el usuario arrastra y suelta una carta en la mesa, enviar `PlayerDragEvent` con `cardIndex` (0-based) para que el backend quite esa carta de la mano.
  - No borrar la carta de la UI hasta recibir confirmación (`CARTA_JUGADA`, `PARTIDA_STATE` o `TURNO_CAMBIADO`).

  Tipos de eventos y cómo manejarlos

  - PARTIDA_STATE
    - Ejemplo: {"tipo":"PARTIDA_STATE","codigo":"9FE778","jugadorId":null,"jugadores":[...]}.
    - Contiene el estado completo de la partida (lista de jugadores, cartaActual, numeroCartas, conectado, etc.).
    - Uso: sincronizar el panel de jugadores y la mano local (mapear códigos de cartas a metadatos).

  - CARTA_JUGADA
    - Ejemplo: {"tipo":"CARTA_JUGADA","jugadorId":"...","nombreJugador":"...","codigoCarta":"3D","nombreCarta":"DB_3D","imagenCarta":null,...}
    - Uso: mostrar la carta jugada en la mesa (animación), actualizar contador mediante `counts` y esperar `TURNO_CAMBIADO`.

  - TURNO_CAMBIADO
    - Ejemplo: {"tipo":"TURNO_CAMBIADO","expectedPlayerId":"...","expectedPlayerNombre":"...","alreadyPlayed":1}
    - Uso: habilitar controles para el jugador `expectedPlayerId`. Si `expectedPlayerId === miJugadorId` habilita el drag/drop y selección de atributo (si corresponde).

  - counts (topic separado `/topic/partida/{codigo}/counts`)
    - Ejemplo: {"tipo":"CARD_COUNTS","counts":[...]} o payloads simples con número de cartas.
    - Uso: actualizar badges/contador de cartas por jugador.

  - ServerErrorEvent (user-scoped)
    - El backend publica errores a `/user/queue/partida/{codigo}/errors` con un `tipo` (por ejemplo `ERROR_JUEGO`) y mensaje.
    - Uso: mostrar toast/modal y, si es grave, solicitar re-sync (pedir `PARTIDA_STATE` o reconexión).

  Reglas y mejores prácticas

  - Discriminar por `tipo` en el body del mensaje y usar switch/case en el parser central.
  - Nunca mutar la mano local hasta recibir confirmación del servidor (evita inconsistencias por reintentos o errores). Mantén una UI optimista opcional con undo si el servidor rechaza.
  - En drag/drop enviar `PlayerDragEvent` con `cardIndex` (0-based). El servidor usa `cardIndex` para eliminar la carta específica de la mano.
  - Cuando el usuario reordena su mano (drag dentro de la mano), llamar al endpoint REST que persiste el nuevo orden (si existe) y optimísticamente actualizar la UI.

  Payloads y ejemplos (TypeScript types)

  type PartidaState = {
    tipo: 'PARTIDA_STATE';
    codigo: string;
    jugadorId: string | null;
    jugadores: Array<{ id: string; nombre: string; cartasEnMano: string[]; cartaActual: string | null; numeroCartas: number; orden: number; conectado: boolean }>;
  }

  type CartaJugadaEvent = {
    tipo: 'CARTA_JUGADA';
    jugadorId: string;
    nombreJugador: string;
    codigoCarta: string;
    nombreCarta: string;
    imagenCarta?: string | null;
  }

  type TurnoCambiadoEvent = {
    tipo: 'TURNO_CAMBIADO';
    expectedPlayerId: string;
    expectedPlayerNombre: string;
    alreadyPlayed: number;
  }

  type PlayerDragEvent = {
    tipo: 'PLAYER_DRAG';
    codigoPartida: string;
    jugadorId: string;
    cardIndex?: number; // 0-based index en la mano
    dropTarget: 'MANO' | 'MESA';
  }

  Snippets de integración (conceptual, adaptarlo a tu stack)

  - Parser central (websocket.ts / stomp-handler)

    // Pseudocódigo TS
    function handleMessage(msg) {
      const body = JSON.parse(msg.body);
      if (!body || !body.tipo) {
        console.warn('Evento sin tipo recibido (ignorando):', body);
        return;
      }
      switch (body.tipo) {
        case 'PARTIDA_STATE':
          handlePartidaState(body as PartidaState);
          break;
        case 'CARTA_JUGADA':
          handleCartaJugada(body as CartaJugadaEvent);
          break;
        case 'TURNO_CAMBIADO':
          handleTurnoCambiado(body as TurnoCambiadoEvent);
          break;
        // counts puede venir en otro topic
        default:
          console.debug('Evento no manejado', body.tipo);
      }
    }

  - Envío de jugada por drag/drop (useLobbyRealTime / drop handler)

    // cuando el usuario suelta la carta sobre la mesa
    async function onDropToMesa(cardIndex: number) {
      const evt: PlayerDragEvent = {
        tipo: 'PLAYER_DRAG',
        codigoPartida: partidaCodigo,
        jugadorId: miJugadorId,
        cardIndex,
        dropTarget: 'MESA'
      };
      stompClient.send('/app/partida/drag', {}, JSON.stringify(evt));

      // UX: marcar la carta como 'pendiente' visualmente, pero NO eliminarla hasta confirmación
    }

  - Handler de `TURNO_CAMBIADO` (habilitar controles)

    function handleTurnoCambiado(evt: TurnoCambiadoEvent) {
      const soy = evt.expectedPlayerId === miJugadorId;
      setMiTurno(soy);
      if (soy) {
        // habilitar drag, mostrar selector de atributo si alreadyPlayed==0
      } else {
        // deshabilitar controles de juego
      }
    }

  Sincronización de mano y `PARTIDA_STATE`

  - Cuando recibas `PARTIDA_STATE`, debes sincronizar la representación interna de la partida:
    - actualizar `jugadores` y `numeroCartas`
    - reemplazar la mano local por la lista `cartasEnMano` recibida (la partida almacena códigos: mapéalos a metadatos con tu cache local de cartas)
    - si habías marcado cartas como "pendientes", cotejalas con `CARTA_JUGADA` o `PARTIDA_STATE` para confirmar/limpiar el estado optimista

  Persistencia del orden de mano (reorder)

  - Cuando el usuario reordena su mano local, llamar a la API REST que persiste el nuevo orden (si ya existe en backend):
    - POST /api/partida/{codigo}/jugador/{jugadorId}/mano { cartasEnMano: ["4F","2H",...] }
    - Espera confirmación (200) y en caso de error reintentarlo o revertir el orden local.

  Debugging y pasos para reproducir errores (resumen)

  1) Evento sin `tipo` / ignorado
     - Causa: objetos enviados por backend no tenían `tipo`.
     - Qué hice: backend ahora envía `tipo` para `PARTIDA_STATE` y `TURNO_CAMBIADO`.
     - Cómo comprobar: en consola buscar líneas como: "Evento recibido: TURNO_CAMBIADO" o "Evento recibido: PARTIDA_STATE".

  2) El frontend hace GET a `http://localhost:3000/api/cartas` y recibe 404
     - Motivo: en dev Next.js intenta resolver `/api/cartas` localmente. Opciones:
       - Establecer variable de entorno `NEXT_PUBLIC_API_BASE` apuntando al backend (ej. `http://localhost:8080`) y usarla al hacer fetch: `${process.env.NEXT_PUBLIC_API_BASE}/api/cartas`.
       - O configurar proxy rewrites en `next.config.js` para enrutar `/api/cartas` a `http://localhost:8080/api/cartas` en desarrollo.
     - Recomiendo la variable `NEXT_PUBLIC_API_BASE` porque es explícita y funciona en producción si cambia la URL.

  3) Comportamiento optimista vs real
     - No elimines la carta de la UI hasta recibir `CARTA_JUGADA` o `PARTIDA_STATE` confirmatorio. Marca la carta como "enviada" (spinner/overlay) mientras esperas.

  Checklist para Copilot (tareas concretas a generar)

  1. Implementar parser central que inspeccione `body.tipo` y despache a handlers.
  2. Implementar `handlePartidaState` que actualice el estado global de la partida y la mano local.
  3. Implementar `handleCartaJugada` para animar la jugada y limpiar la carta "pendiente".
  4. Implementar `handleTurnoCambiado` para habilitar/deshabilitar controles.
  5. Cambiar los envíos de drag/drop para incluir `cardIndex` y `dropTarget`.
  6. Añadir visualización de estado "pendiente" en la carta arrastrada.
  7. Manejar errores recibidos en `/user/queue/partida/{codigo}/errors` y mostrar toasts.
  8. Documentar variable `NEXT_PUBLIC_API_BASE` y/o proxy en `next.config.js`.

  Ejemplo mínimo de `next.config.js` (proxy dev)

  module.exports = {
    async rewrites() {
      return [
        { source: '/api/:path*', destination: 'http://localhost:8080/api/:path*' }
      ]
    }
  }

  Comandos útiles para probar localmente

  1) Ejecutar backend (desde el repo):
  ```powershell
  ./mvnw -DskipTests spring-boot:run
  ```

  2) Ejecutar frontend (Next.js):
  ```powershell
  npm run dev
  ```

  3) Ver tráfico STOMP en consola: abrir DevTools → Console y buscar las líneas `Evento recibido`/`WS raw body snippet`.

  Notas finales

  - El backend ya publica `PARTIDA_STATE` y `TURNO_CAMBIADO` con `tipo`. El frontend debe aprovechar `PARTIDA_STATE` como fuente de verdad para el panel de jugadores y usar `TURNO_CAMBIADO` para controlar habilitación de UI.
  - Si quieres, genero los snippets concretos para tus archivos `websocket.ts` y `useLobbyRealTime.ts` (o aplico el cambio en el código del frontend si me indicas la estructura de carpetas). 

  Archivo creado/actualizado automáticamente para que Copilot genere código frontend consistente con el backend.
