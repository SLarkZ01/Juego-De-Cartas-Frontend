# Reconexión en Frontend (Next.js)

Esta guía describe cómo integrar el comportamiento de reconexión del backend en una aplicación Next.js. El backend ahora acepta dos formas principales para reconectar a un jugador:

- POST `/api/partidas/{codigo}/unirse`: idempotente — si el usuario autenticado ya existe en la partida (por userId), el servidor lo marcará como conectado nuevamente y publicará el estado actualizado en `/topic/partida/{codigo}`.
- STOMP `/app/partida/registrar` (WebSocket): al abrir una conexión STOMP, el cliente debe enviar `{ jugadorId, partidaCodigo }` al destino `/app/partida/registrar`. El servidor cancelará cualquier tarea de desconexión pendiente y asociará la `sessionId` con el `jugadorId`.

## Objetivo del flujo en el frontend

1. Mantener en el cliente (localStorage) `jugadorId` y `partidaCodigo` después de crear/unirse a una partida.
2. Al abrir la pantalla de la partida (o reload), intentar automáticamente:
   - Llamar POST `/api/partidas/{codigo}/unirse` (esto reconectará si el userId ya existe en la partida). Si responde OK, actualizar UI con la `PartidaResponse` recibida.
   - Conectar WebSocket (STOMP) y, tras `onConnect`, enviar `/app/partida/registrar` con payload `{ jugadorId, partidaCodigo }` para asociar sessionId -> jugadorId y recibir eventos en `/topic/partida/{codigo}`.
3. Manejar desconexiones temporales: el backend ofrece un "grace period" (configurable, por defecto 5s). Si el cliente pierde la WS pero se reconecta dentro del periodo, no se verá el efecto de desconexión en el lobby.

## Requerimientos en el frontend

- Guardar `jugadorId` y `partidaCodigo` cuando se crea o se une a una partida.
- Reintentos automáticos con backoff al reconectar WebSocket.
- Al reintentar unirse (POST /unirse), manejar el caso en que la respuesta indica que el usuario ya estaba: ahora el servidor devolverá la `PartidaResponse` actualizada y la UI debe sincronizarse con ella.

## Ejemplo de implementación (Next.js - React)

A continuación hay ejemplos condensados. Adáptalos a tu stack (fetch cliente, autenticación, hooks, etc.).

### 1) Guardar jugadorId y codigo

- Después de POST `/api/partidas/crear` y `/api/partidas/{codigo}/unirse`, guardar en `localStorage`:

```js
localStorage.setItem('jugadorId', respuesta.jugadorId);
localStorage.setItem('partidaCodigo', respuesta.codigo);
```

> Nota: la API asume autenticación; `userId` se obtiene del token en el backend. Asegúrate de usar el mismo usuario (misma sesión) cuando esperas reconectar por userId.

### 2) Hook `usePartidaReconectar` (esqueleto)

- Comportamiento: cuando el componente de la partida se monta, intenta una llamada REST `unirse`/`reconectar` y luego conecta WS.

```js
import { useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';

export function usePartidaReconectar() {
  const [partida, setPartida] = useState(null);
  const clientRef = useRef(null);

  useEffect(() => {
    const jugadorId = localStorage.getItem('jugadorId');
    const codigo = localStorage.getItem('partidaCodigo');
    if (!codigo) return;

    // Intentar unirse/reconectar por REST. Si ya existe en la partida, el servidor devolverá el PartidaResponse actualizado.
    (async () => {
      try {
        const resp = await fetch(`/api/partidas/${codigo}/unirse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        if (resp.ok) {
          const data = await resp.json();
          setPartida(data);
          // Actualizar jugadorId/partidaCodigo si el backend devolvió nuevos valores
          if (data.jugadorId) localStorage.setItem('jugadorId', data.jugadorId);
          if (data.codigo) localStorage.setItem('partidaCodigo', data.codigo);
        } else {
          // Manejar errores (404, 400, etc.) según UX
          console.error('No fue posible unirse/reconectar por REST', resp.status);
        }
      } catch (e) {
        console.error('Error llamando /unirse:', e);
      }

      // Conectar WebSocket tras intentar REST
      conectarWebSocket(codigo);
    })();

    return () => {
      // cleanup: desconectar STOMP
      if (clientRef.current) clientRef.current.deactivate();
    };
  }, []);

  function conectarWebSocket(codigo) {
    const jugadorId = localStorage.getItem('jugadorId');

    const client = new Client({
      brokerURL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws',
      reconnectDelay: 5000,
      onConnect: () => {
        console.log('WS conectado');
        // Subscribirse al topic principal de la partida
        client.subscribe(`/topic/partida/${codigo}`, (msg) => {
          const payload = JSON.parse(msg.body);
          // Actualizar estado local según payload
          setPartida(payload);
        });

        // Registrar jugador en servidor (cancelar grace y asociar session)
        const registrarPayload = { jugadorId, partidaCodigo: codigo };
        client.publish({ destination: '/app/partida/registrar', body: JSON.stringify(registrarPayload) });
      },
      onStompError: (frame) => console.error('STOMP error', frame),
      onDisconnect: () => console.log('WS desconectado')
    });

    client.activate();
    clientRef.current = client;
  }

  return { partida };
}
```

> Observaciones:
> - Recomendado: usar `reconnectDelay` y backoff exponencial si la conexión falla frecuentemente.
> - El `Client` de `@stomp/stompjs` puede usar `webSocketFactory: () => new SockJS(url)` si necesitas compatibilidad con proxys.

### 3) Manejo de recarga/escenario incógnito

- Escenario que resolviste: el usuario B cierra la pestaña (queda desconectado en WS). Si reabre con la misma cuenta (autenticación igual), el frontend intentará `POST /api/partidas/{codigo}/unirse`. El servidor, al ver que ese userId ya está en la partida, no lanzará error: marcará `conectado=true` y devolverá `PartidaResponse`. Luego, al conectar WS y enviar `/app/partida/registrar` con `{ jugadorId, partidaCodigo }`, la sesión se asociará y todo quedará sincronizado.

### 4) Lógica alternativa: POST `/api/partidas/{codigo}/reconectar`

También existe en el backend un endpoint explícito `POST /api/partidas/{codigo}/reconectar`. Puedes usarlo para reconectar (si quieres separar responsabilidades). Ejemplo de llamada:

```js
await fetch(`/api/partidas/${codigo}/reconectar`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ jugadorId }) });
```

Usar `/unirse` es conveniente porque simplifica la UX (crear/unirse actúan de forma idempotente si ya existes en la partida).

## Recomendaciones finales

- Mantén `jugadorId` y `partidaCodigo` en `localStorage` y úsalo para intentos automáticos de reconexión.
- En el cliente WebSocket, al recuperarse de desconexión, vuelve a publicar `/app/partida/registrar` para reasociar la sesión.
- Ten en cuenta el `graceSeconds` del backend (por defecto 5s): si el cliente se reconecta dentro del período, no verás parpadeos de "desconectado" en el lobby.
- Para despliegues en múltiples instancias, coordina la sesión/lock si migras `DisconnectGraceService` a una solución distribuida.

Si quieres, puedo:
- Añadir un snippet listo para copiar en tu proyecto Next.js (hook completo y componente de ejemplo).
- Añadir tests de integración backend que cubran el flujo reconectar/unirse.

---
Guía generada automáticamente según la implementación actual del backend en este repositorio.
