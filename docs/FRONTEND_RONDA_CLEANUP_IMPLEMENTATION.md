# Implementación frontend: limpieza de mesa y actualización en tiempo real (Guía para Copilot)

Propósito
- Explicar exactamente qué debe hacer el frontend para que, cuando una ronda termine con ganador, la "mesa" se limpie en tiempo real y el mazo del ganador se actualice visualmente.
- Incluir suscripciones, handlers, snippets prácticos (React + STOMP) y pruebas recomendadas.

Resumen del comportamiento esperado
- Cuando el servidor resuelve una ronda con ganador, el backend ejecuta:
  - añade las cartas ganadas a la mano del ganador en el modelo persistido,
  - limpia `p.cartasEnMesa` en el servidor,
  - persiste el estado y publica eventos en STOMP:
    - `RONDA_RESUELTA` (RondaResueltaEvent) en `/topic/partida/{codigo}`
    - `CardCountEvent` en `/topic/partida/{codigo}/counts`
- El frontend debe: al recibir `RONDA_RESUELTA` y/o `CardCountEvent` limpiar la vista de la mesa, actualizar contadores y (opcional) solicitar estado completo si necesita ver las cartas añadidas del ganador.

Suscripciones y topics
- Suscribirse a `/topic/partida/{codigo}` -> recibe `ATRIBUTO_SELECCIONADO`, `CARTA_JUGADA`, `RONDA_RESUELTA`, `PARTIDA_ESTADO`/`PARTIDA_STATE`, etc.
- Suscribirse a `/topic/partida/{codigo}/counts` -> recibe `CardCountEvent` con número de cartas por jugador.
- (Opcional) Suscribirse a `/user/queue/partida/{codigo}/errors` para errores dirigidos.

Eventos clave y qué contienen
- ATRIBUTO_SELECCIONADO
  - { tipo: 'ATRIBUTO_SELECCIONADO', jugadorId, nombreJugador, atributo }
  - Acción frontend: mostrar el atributo seleccionado en la mesa y habilitar el primer drop.
- CARTA_JUGADA
  - { tipo: 'CARTA_JUGADA', jugadorId, nombreJugador, cartaCodigo, ... }
  - Acción frontend: mostrar la carta jugada en la mesa.
- RONDA_RESUELTA
  - { tipo: 'RONDA_RESUELTA', ganadorId|null, nombreGanador, atributoUsado, valorGanador, resultados[], empate:boolean }
  - Acción frontend: limpiar la mesa, mostrar animación/resultado, actualizar estado local de turno.
- CardCountEvent
  - { counts: [{ jugadorId, nombre, numeroCartas, orden }, ...] }
  - Acción frontend: actualizar el panel de jugadores/contadores.
- PARTIDA_ESTADO / PartidaDetailResponse
  - utilidad para sincronizar al reconectar. Contiene `atributoSeleccionado`, `turnoActual`, jugadores públicos/privados y `miJugador.cartasEnMano`.

Implementación recomendada (React + @stomp/stompjs)
- Requisitos: `npm i @stomp/stompjs sockjs-client` o usar la librería que ya tengáis.

1) Conectar y suscribirse (hook reutilizable)
```javascript
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useEffect, useRef } from 'react';

export function usePartidaStomp(codigo, handlers) {
  const clientRef = useRef(null);

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      reconnectDelay: 5000,
      debug: (str) => console.debug('[STOMP]', str)
    });

    client.onConnect = () => {
      client.subscribe(`/topic/partida/${codigo}`, msg => {
        const body = JSON.parse(msg.body);
        handlers.onPartidaEvent && handlers.onPartidaEvent(body);
      });

      client.subscribe(`/topic/partida/${codigo}/counts`, msg => {
        const body = JSON.parse(msg.body);
        handlers.onCounts && handlers.onCounts(body);
      });
    };

    client.activate();
    clientRef.current = client;

    return () => { client.deactivate(); };
  }, [codigo]);

  return clientRef;
}
```

2) Manejar eventos centrales
```javascript
function onPartidaEvent(body) {
  switch (body.tipo) {
    case 'ATRIBUTO_SELECCIONADO':
      handleAtributoSeleccionado(body);
      break;
    case 'CARTA_JUGADA':
      handleCartaJugado(body);
      break;
    case 'RONDA_RESUELTA':
    case 'RondaResueltaEvent':
      handleRondaResuelta(body);
      break;
    case 'PARTIDA_ESTADO':
    case 'PARTIDA_STATE':
      handlePartidaState(body);
      break;
    default:
      // log/ignore
  }
}
```

3) Qué debe hacer `handleRondaResuelta` exactamente (puntos concretos)
- Mostrar un pequeño modal/animación con el resultado (ganador, atributo, valor).
- Limpiar inmediatamente la vista de la mesa (ej.: setMesa([]) o eliminar los elementos DOM que representan las cartas en mesa).
- Actualizar localmente el turno actual (si el evento incluye ganador o usar `TurnoCambiadoEvent` que suele venir justo después).
- Si recibes `empate === true`, no otorgues cartas en la UI; muestra que las cartas se acumulan (opcional badge en la mesa con número acumulado).
- Tras limpiar la mesa, actualizar los contadores con el último `CardCountEvent` o con los datos incorporados en el mismo `RONDA_RESUELTA`.

Ejemplo de handler:
```javascript
function handleRondaResuelta(evt) {
  // 1. animación/result
  showRoundResult(evt);

  // 2. limpiar representación de mesa
  setMesa([]); // model-driven

  // 3. actualizar contadores si evt no incluye counts
  // esperar CardCountEvent o solicitar estado si quieres datos completos
  // 4. solicitar estado completo para el ganador si necesita ver cartas añadidas
  if (evt.ganadorId && myPlayerId === evt.ganadorId) {
    // pedir estado detallado para actualizar mi mano con las cartas añadidas
    stompClient.current && stompClient.current.publish({
      destination: `/app/partida/${codigo}/accion`,
      body: JSON.stringify({ accion: 'SOLICITAR_ESTADO', jugadorId: myPlayerId })
    });
  }
}
```

4) Manejo de `CardCountEvent`
- Actualizar el panel lateral con `numeroCartas` por jugador.
- Si el frontend mantiene su propio array de `cartasEnMano`, NO intentes inferir las cartas que ganó otro jugador (privacidad); usa el `PartidaEstadoEvent` cuando sea tuyo.

5) Reconexiones y garantías de consistencia
- Al reconectar, enviar acción `SOLICITAR_ESTADO` para obtener `PartidaDetailResponse` y poblar `atributoSeleccionado`, `turnoActual`, y `miJugador.cartasEnMano`.
- Como fallback, si detectas que no has recibido `RONDA_RESUELTA` o `CardCountEvent` por latencia, pide `PARTIDA_ESTADO` pasados X ms.

6) Tests recomendados (unitarios y e2e)
- Unit: simular la llegada de un `RONDA_RESUELTA` y assert que `mesa` queda vacía y que se llama a `stomp.publish` para solicitar estado si eres ganador.
- E2E: sesión A y B conectados, A gana la ronda; B debe recibir `RONDA_RESUELTA` y ver la mesa vacía inmediatamente.

Edge cases y detalles finos
- Si tu UI muestra las cartas en la mesa a partir de `PartidaResponse` (estado completo) en vez de eventos de WS, asegúrate de que `PartidaResponse` sea publicado tras la resolución. Si no lo es, implementa el handler de `RONDA_RESUELTA` para limpiar la UI.
- Si el frontend aplica optimismo (por ejemplo, elimina la carta localmente al hacer drag->drop), mantén un mecanismo para reconciliar con `CARTA_JUGADA` o `PARTIDA_STATE` en caso de desincronía.
- Cuando hay empate: el backend acumula cartas en `p.cartasAcumuladasEmpate`. Puedes mostrar un pequeño contador en la mesa con el número acumulado para feedback visual.

Checklist final para implementar
- [ ] Suscribirse a `/topic/partida/{codigo}` y `/topic/partida/{codigo}/counts`.
- [ ] Implementar `onPartidaEvent` central que despache por `tipo`.
- [ ] Implementar `handleRondaResuelta` que limpie la mesa y active animación.
- [ ] Implementar `handleCardCount` para actualizar panel de jugadores.
- [ ] Al reconectar, enviar `SOLICITAR_ESTADO` para sincronizar estado completo.
- [ ] Añadir tests unitarios y e2e que verifiquen la limpieza inmediata y la actualización de contadores.

Notas finales
- El backend ya publica `RONDA_RESUELTA` y `CardCountEvent` en tiempo real. El trabajo del frontend es reaccionar a esos eventos y actualizar el DOM/modelo para que la mesa se limpie y los contadores se actualicen.

---
Archivo: `docs/FRONTEND_RONDA_CLEANUP_IMPLEMENTATION.md`
