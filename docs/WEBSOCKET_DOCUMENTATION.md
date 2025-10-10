# WebSocket - Documentación del Juego en Tiempo Real

## Información General

El backend del juego de cartas utiliza WebSocket con protocolo STOMP para comunicación en tiempo real entre el servidor y los clientes.

### Configuración

- **URL de conexión**: `ws://localhost:8080/ws` (con SockJS habilitado)
- **Prefijo de aplicación**: `/app`
- **Prefijo de topic (suscripción)**: `/topic`
- **Origen permitido**: `http://localhost:3000` (Next.js)

## Flujo de Conexión

### 1. Establecer Conexión WebSocket

El cliente debe conectarse primero al endpoint WebSocket:

```javascript
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

const socket = new SockJS('http://localhost:8080/ws');
const stompClient = new Client({
  webSocketFactory: () => socket,
  debug: (str) => console.log(str),
  onConnect: () => {
    console.log('Conectado al servidor WebSocket');
    // Suscribirse a la partida
    stompClient.subscribe('/topic/partida/ABC123', (message) => {
      const evento = JSON.parse(message.body);
      console.log('Evento recibido:', evento);
    });
  }
});

stompClient.activate();
```

### 2. Suscribirse al Topic de la Partida

Cada partida tiene su propio topic. Los clientes deben suscribirse para recibir eventos:

**Topic**: `/topic/partida/{codigoPartida}`

Ejemplo: `/topic/partida/ABC123`

### 3. Enviar Acciones al Servidor

Los clientes envían acciones del juego al servidor:

**Destino**: `/app/partida/{codigoPartida}/accion`

**Formato del mensaje**:
```json
{
  "accion": "JUGAR_CARTA",
  "jugadorId": "player-uuid-1234",
  "atributo": null,
  "indiceTransformacion": null
}
```

## Acciones Disponibles

### SELECCIONAR_ATRIBUTO

Selecciona el atributo para comparar las cartas en la ronda actual.

**Campos requeridos**:
- `accion`: `"SELECCIONAR_ATRIBUTO"`
- `jugadorId`: ID del jugador que selecciona
- `atributo`: Nombre del atributo (`"poder"`, `"velocidad"`, `"ki"`, `"tecnica"`, `"fuerza"`)

**Ejemplo**:
```json
{
  "accion": "SELECCIONAR_ATRIBUTO",
  "jugadorId": "player-uuid-1234",
  "atributo": "poder"
}
```

### JUGAR_CARTA

Juega la carta actual del jugador en la ronda.

**Campos requeridos**:
- `accion`: `"JUGAR_CARTA"`
- `jugadorId`: ID del jugador que juega

**Ejemplo**:
```json
{
  "accion": "JUGAR_CARTA",
  "jugadorId": "player-uuid-1234"
}
```

### ACTIVAR_TRANSFORMACION

Activa una transformación del personaje (ej: Super Saiyan).

**Campos requeridos**:
- `accion`: `"ACTIVAR_TRANSFORMACION"`
- `jugadorId`: ID del jugador
- `indiceTransformacion`: Índice de la transformación (0 = primera, 1 = segunda, etc.)

**Ejemplo**:
```json
{
  "accion": "ACTIVAR_TRANSFORMACION",
  "jugadorId": "player-uuid-1234",
  "indiceTransformacion": 0
}
```

### DESACTIVAR_TRANSFORMACION

Desactiva la transformación activa del jugador.

**Campos requeridos**:
- `accion`: `"DESACTIVAR_TRANSFORMACION"`
- `jugadorId`: ID del jugador

**Ejemplo**:
```json
{
  "accion": "DESACTIVAR_TRANSFORMACION",
  "jugadorId": "player-uuid-1234"
}
```

### SOLICITAR_ESTADO

Solicita el estado completo actual de la partida.

**Campos requeridos**:
- `accion`: `"SOLICITAR_ESTADO"`
- `jugadorId`: ID del jugador solicitante

**Ejemplo**:
```json
{
  "accion": "SOLICITAR_ESTADO",
  "jugadorId": "player-uuid-1234"
}
```

## Eventos del Servidor

Todos los eventos tienen un campo `tipo` que identifica el tipo de evento y un campo `timestamp`.

### JUGADOR_UNIDO

Se envía cuando un jugador se une a la partida.

```json
{
  "tipo": "JUGADOR_UNIDO",
  "jugadorId": "player-uuid-5678",
  "nombreJugador": "Vegeta",
  "totalJugadores": 3,
  "jugadoresRequeridos": 7,
  "timestamp": "2025-10-09T12:00:00Z"
}
```

### PARTIDA_INICIADA

Se envía cuando la partida inicia (7 jugadores unidos).

```json
{
  "tipo": "PARTIDA_INICIADA",
  "turnoActual": "player-uuid-1234",
  "nombreJugadorTurno": "Goku",
  "tiempoLimiteSegundos": 1800,
  "timestamp": "2025-10-09T12:00:00Z"
}
```

### ATRIBUTO_SELECCIONADO

Se envía cuando un jugador selecciona el atributo para la ronda.

```json
{
  "tipo": "ATRIBUTO_SELECCIONADO",
  "jugadorId": "player-uuid-1234",
  "nombreJugador": "Goku",
  "atributo": "poder",
  "timestamp": "2025-10-09T12:00:00Z"
}
```

### CARTA_JUGADA

Se envía cuando un jugador juega una carta.

```json
{
  "tipo": "CARTA_JUGADA",
  "jugadorId": "player-uuid-1234",
  "nombreJugador": "Goku",
  "codigoCarta": "1A",
  "nombreCarta": "Goku",
  "imagenCarta": "https://dragonball-api.com/characters/goku_normal.webp",
  "timestamp": "2025-10-09T12:00:00Z"
}
```

### RONDA_RESUELTA

Se envía cuando todos los jugadores han jugado y se resuelve la ronda.

```json
{
  "tipo": "RONDA_RESUELTA",
  "ganadorId": "player-uuid-1234",
  "nombreGanador": "Goku",
  "atributoUsado": "poder",
  "valorGanador": 9500,
  "empate": false,
  "resultados": [
    {
      "jugadorId": "player-uuid-1234",
      "nombreJugador": "Goku",
      "codigoCarta": "1A",
      "valor": 9500
    },
    {
      "jugadorId": "player-uuid-5678",
      "nombreJugador": "Vegeta",
      "codigoCarta": "2B",
      "valor": 9000
    }
  ],
  "timestamp": "2025-10-09T12:00:00Z"
}
```

### TRANSFORMACION_ACTIVADA

Se envía cuando un jugador activa una transformación.

```json
{
  "tipo": "TRANSFORMACION_ACTIVADA",
  "jugadorId": "player-uuid-1234",
  "nombreJugador": "Goku",
  "nombreTransformacion": "Super Saiyan",
  "multiplicador": 1.5,
  "activada": true,
  "timestamp": "2025-10-09T12:00:00Z"
}
```

### TRANSFORMACION_DESACTIVADA

Se envía cuando un jugador desactiva su transformación.

```json
{
  "tipo": "TRANSFORMACION_DESACTIVADA",
  "jugadorId": "player-uuid-1234",
  "nombreJugador": "Goku",
  "nombreTransformacion": "Super Saiyan",
  "multiplicador": 1.0,
  "activada": false,
  "timestamp": "2025-10-09T12:00:00Z"
}
```

### JUEGO_FINALIZADO

Se envía cuando el juego termina (un jugador tiene todas las cartas o se acabó el tiempo).

```json
{
  "tipo": "JUEGO_FINALIZADO",
  "ganadorId": "player-uuid-1234",
  "nombreGanador": "Goku",
  "razon": "Ganador por quedarse con todas las cartas",
  "empate": false,
  "timestamp": "2025-10-09T12:00:00Z"
}
```

### PARTIDA_ESTADO

Se envía con el estado completo de la partida (cuando se solicita o después de ciertos eventos).

```json
{
  "tipo": "PARTIDA_ESTADO",
  "estado": {
    "codigo": "ABC123",
    "jugadorId": "player-uuid-1234",
    "estado": "EN_CURSO",
    "turnoActual": "player-uuid-5678",
    "atributoSeleccionado": "poder",
    "jugadores": [...],
    "miJugador": {...},
    "tiempoRestante": 1200
  },
  "timestamp": "2025-10-09T12:00:00Z"
}
```

### ERROR

Se envía cuando ocurre un error en el procesamiento de una acción.

```json
{
  "tipo": "ERROR",
  "mensaje": "No es el turno del jugador",
  "codigo": "STATE_ERROR",
  "timestamp": "2025-10-09T12:00:00Z"
}
```

**Códigos de error**:
- `VALIDATION_ERROR`: Error de validación de parámetros
- `STATE_ERROR`: Error de estado (no es tu turno, partida no iniciada, etc.)
- `UNKNOWN_ACTION`: Acción no reconocida
- `INTERNAL_ERROR`: Error interno del servidor

## Ejemplo Completo (Next.js con TypeScript)

```typescript
import { useEffect, useRef, useState } from 'react';
import SockJS from 'sockjs-client';
import { Client, IMessage } from '@stomp/stompjs';

export function useGameWebSocket(partidaCodigo: string, jugadorId: string) {
  const clientRef = useRef<Client | null>(null);
  const [connected, setConnected] = useState(false);
  const [eventos, setEventos] = useState<any[]>([]);

  useEffect(() => {
    const socket = new SockJS('http://localhost:8080/ws');
    const client = new Client({
      webSocketFactory: () => socket,
      debug: (str) => console.log(str),
      onConnect: () => {
        console.log('Conectado');
        setConnected(true);

        // Suscribirse al topic de la partida
        client.subscribe(`/topic/partida/${partidaCodigo}`, (message: IMessage) => {
          const evento = JSON.parse(message.body);
          console.log('Evento recibido:', evento);
          setEventos((prev) => [...prev, evento]);
        });
      },
      onDisconnect: () => {
        console.log('Desconectado');
        setConnected(false);
      }
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
    };
  }, [partidaCodigo]);

  const enviarAccion = (accion: string, extras?: any) => {
    if (clientRef.current && connected) {
      clientRef.current.publish({
        destination: `/app/partida/${partidaCodigo}/accion`,
        body: JSON.stringify({
          accion,
          jugadorId,
          ...extras
        })
      });
    }
  };

  return {
    connected,
    eventos,
    seleccionarAtributo: (atributo: string) => 
      enviarAccion('SELECCIONAR_ATRIBUTO', { atributo }),
    jugarCarta: () => 
      enviarAccion('JUGAR_CARTA'),
    activarTransformacion: (indiceTransformacion: number) => 
      enviarAccion('ACTIVAR_TRANSFORMACION', { indiceTransformacion }),
    desactivarTransformacion: () => 
      enviarAccion('DESACTIVAR_TRANSFORMACION'),
    solicitarEstado: () => 
      enviarAccion('SOLICITAR_ESTADO')
  };
}
```

## Mejores Prácticas

1. **Reconexión automática**: Implementa lógica de reconexión en caso de desconexión inesperada.
2. **Sincronización de estado**: Usa `SOLICITAR_ESTADO` para sincronizar el cliente después de reconectar.
3. **Manejo de errores**: Escucha eventos `ERROR` y muestra mensajes al usuario.
4. **Optimistic UI**: Actualiza la UI optimistamente y corrige si recibes un evento `ERROR`.
5. **Heartbeat**: Configura heartbeat en el cliente STOMP para detectar conexiones perdidas.

## Troubleshooting

### El cliente no recibe eventos
- Verifica que estés suscrito al topic correcto: `/topic/partida/{codigo}`
- Revisa la consola del navegador para errores de conexión
- Confirma que el backend esté corriendo en `http://localhost:8080`

### Errores de CORS
- Verifica que `http://localhost:3000` esté en `setAllowedOriginPatterns` en `WebSocketConfig.java`

### Eventos duplicados
- Asegúrate de no suscribirte múltiples veces al mismo topic
- Usa `useRef` en React para mantener la instancia del cliente

## Seguridad

> **Nota**: La implementación actual **NO incluye autenticación**. En producción se recomienda:
> - Implementar tokens JWT y validarlos en cada mensaje
> - Usar `StompHeaderAccessor` para extraer y validar tokens
> - Asociar sesiones WebSocket con jugadores autenticados
