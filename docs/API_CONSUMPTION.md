## Documentación de consumo de la API - Juego De Cartas

Este documento explica cómo consumir las APIs REST y WebSocket exposadas por el backend de "Juego De Cartas" desde un frontend en Next.js (TypeScript). Incluye rutas, métodos HTTP, esquemas de request/response, ejemplos con fetch y axios, manejo de errores, websockets con STOMP y recomendaciones de dependencias.

Base URL
---------

Por defecto en desarrollo el backend corre en http://localhost:8080 (confirma según tu `application.properties`). Ajusta la variable `NEXT_PUBLIC_API_BASE_URL` en Next.js.

Ejemplo .env.local

NODE_ENV=development
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080

Endpoints Principales
---------------------

1) Cartas

- GET /api/cartas
  - Query params: tematica (opcional)
  - Response: Array de Carta

Ejemplo respuesta (esquema parcial):

{
  "id": "644...",
  "codigo": "DBZ-001",
  "nombre": "Goku",
  "imagenUrl": "https://...",
  "atributos": {"fuerza": 9000, "velocidad": 8500},
  "tematica": "DragonBall",
  "paquete": 1,
  "descripcion": "...",
  "raza": "Saiyan",
  "transformaciones": [{"nombre":"Super Saiyan","imagen":"...","ki":"3 Billion"}]
}

- GET /api/cartas/{codigo}
  - Path param: codigo
  - Response: Carta (200) o 404 si no existe

- POST /api/cartas/sincronizar
  - Sin body
  - Response: Array<Carta> sincronizadas desde la API externa

2) Partidas (creación / unirse / obtener)

- POST /api/partidas/crear
  - Body: CrearPartidaRequest
    - { "nombreJugador": "MiNombre" }
  - Response: PartidaResponse

- POST /api/partidas/{codigo}/unirse
  - Path param: codigo
  - Body: UnirsePartidaRequest
    - { "nombreJugador": "Jugador2" }
  - Response: PartidaResponse

- GET /api/partidas/{codigo}
  - Path param: codigo
  - Response: PartidaResponse (contiene codigo, jugadorId y lista de jugadores)

3) Juego (acciones sobre la partida)

- POST /api/partidas/{codigo}/iniciar
  - Path param: codigo
  - Response: Partida (modelo completo)

- POST /api/partidas/{codigo}/seleccionar-atributo
  - Body: SeleccionarAtributoRequest
    - { "jugadorId": "id-jugador", "atributo": "fuerza" }
  - Response: 200 OK (void)

- POST /api/partidas/{codigo}/jugar
  - Body: JugarCartaRequest
    - { "jugadorId": "id-jugador" }
  - Response: 200 OK (void)

4) Transformaciones

- POST /api/partidas/{codigo}/transformaciones/activar
  - Body: ActivarTransformacionRequest
    - { "jugadorId": "id-jugador", "indiceTransformacion": 1 }
  - Response: TransformacionResponse

- POST /api/partidas/{codigo}/transformaciones/desactivar
  - Body: DesactivarTransformacionRequest
    - { "jugadorId": "id-jugador" }
  - Response: TransformacionResponse

Errores comunes
--------------

- 400 Bad Request: body inválido o violación de validaciones (@NotBlank, @Min, etc.). El backend devuelve ErrorResponse: { mensaje, codigo, timestamp }.
- 404 Not Found: recurso no encontrado.
- 500 Server Error: falla no esperada.

Autenticación y CORS
---------------------

Este proyecto no muestra en el código snippets de autenticación (JWT/OAuth). Si tu backend tiene seguridad activada, añade un interceptor/headers Authorization en las llamadas. Asegúrate de que `application.properties` permita CORS para el dominio del frontend (o usar `CorsConfig` si existe).

WebSocket (STOMP) - Comunicación en tiempo real
---------------------------------------------

El servidor expone endpoints STOMP. Observa `GameWebSocketController`:

- Mensajes de cliente a servidor (enviar a): /app/partida/{codigo}/accion
  - Payload: WsActionRequest { accion: string, jugadorId: string, atributo?: string }
  - Acciones soportadas por el servidor (ejemplo): "SELECCIONAR_ATRIBUTO", "JUGAR_CARTA"

- Suscripción a eventos: /topic/partida/{codigo}
  - El servidor publica eventos de estado, errores y actualizaciones de la partida.

Recomendación cliente: usar `@stomp/stompjs` o `sockjs-client` + `@stomp/stompjs`.

Ejemplos desde Next.js (TypeScript)
-----------------------------------

1) Estructura sugerida

- /lib/api.ts -> cliente axios/fetch centralizado
- /hooks/usePartida.ts -> hooks para obtener/crear/unirse/iniciar
- /types/api.d.ts -> tipos TypeScript para DTOs y modelos

2) Tipos TypeScript (ejemplo `types/api.d.ts`)

export interface Carta {
  id?: string;
  codigo: string;
  nombre: string;
  imagenUrl?: string;
  atributos?: Record<string, number>;
  tematica?: string;
  paquete?: number;
  descripcion?: string;
  raza?: string;
  transformaciones?: { nombre: string; imagen?: string; ki?: string }[];
}

export interface PartidaResponse {
  codigo: string;
  jugadorId: string;
  jugadores: { id: string; nombre: string }[];
}

export interface TransformacionResponse {
  jugadorId: string;
  nombreJugador?: string;
  nombreTransformacion?: string | null;
  indiceTransformacion: number;
  multiplicador: number;
  mensaje: string;
  exitoso: boolean;
}

3) Cliente API centralizado (`/lib/api.ts`)

// usando axios
import axios from 'axios';

const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Interceptor de auth (si usas token)
api.interceptors.request.use(config => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token && config.headers) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

export default api;

4) Ejemplos de llamadas (fetch y axios)

-- Obtener todas las cartas (axios)
const { data } = await api.get<Carta[]>('/api/cartas');

-- Obtener carta por código (fetch)
const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/cartas/${codigo}`);
if (!res.ok) throw new Error(await res.text());
const carta: Carta = await res.json();

-- Crear partida (axios)
const { data } = await api.post<PartidaResponse>('/api/partidas/crear', { nombreJugador: 'MiNombre' });

-- Unirse a partida
const { data } = await api.post<PartidaResponse>(`/api/partidas/${codigo}/unirse`, { nombreJugador: 'Jugador2' });

-- Iniciar partida
await api.post(`/api/partidas/${codigo}/iniciar`);

-- Seleccionar atributo
await api.post(`/api/partidas/${codigo}/seleccionar-atributo`, { jugadorId, atributo });

-- Jugar carta
await api.post(`/api/partidas/${codigo}/jugar`, { jugadorId });

-- Activar transformación
const tr = await api.post<TransformacionResponse>(`/api/partidas/${codigo}/transformaciones/activar`, { jugadorId, indiceTransformacion: 1 });

WebSocket (STOMP) example (Next.js client)

import { Client } from '@stomp/stompjs';

const client = new Client({
  brokerURL: 'ws://localhost:8080/ws', // ajustar según config WebSocket en backend
  reconnectDelay: 5000,
});

client.onConnect = () => {
  client.subscribe(`/topic/partida/${codigo}`, message => {
    const body = JSON.parse(message.body);
    // actualizar estado local según el evento
  });
};

client.activate();

// enviar acción
client.publish({ destination: `/app/partida/${codigo}/accion`, body: JSON.stringify({ accion: 'JUGAR_CARTA', jugadorId }) });

Buenas prácticas y consideraciones
---------------------------------

- Timeouts y reintentos: configura timeouts y reintentos en axios para llamadas críticas.
- Validación en frontend: valida los cuerpos antes de enviarlos (ej. jugadorId no vacío, índices >= 0).
- Manejo de errores: centraliza el manejo de errores en un interceptor (para axios) y muestra mensajes de usuario claros.
- CORS: si tienes problemas de CORS, agrega orígenes permitidos en `CorsConfig` del backend.
- Tipado: crea tipos TypeScript para cada DTO y usa generics con axios/fetch.

Dependencias recomendadas (frontend)
-------------------------------------

- next (obvio)
- react, react-dom
- axios (cliente HTTP): `npm i axios`
- swr (caching y revalidación): `npm i swr`
- @stomp/stompjs (WebSocket STOMP client): `npm i @stomp/stompjs`
- sockjs-client (si el backend requiere SockJS): `npm i sockjs-client`
- next-auth (si añades auth): `npm i next-auth`

Comandos de instalación (powershell)

npm install axios swr @stomp/stompjs sockjs-client

Ejemplo de integración rápida (hook usePartida)

import useSWR from 'swr';
import api from '../lib/api';

export function usePartida(codigo?: string) {
  const fetcher = (url: string) => api.get(url).then(r => r.data);
  const { data, error, mutate } = useSWR(codigo ? `/api/partidas/${codigo}` : null, fetcher, { refreshInterval: 2000 });
  return { partida: data, isLoading: !error && !data, isError: error, mutate };
}

Checklist final antes de consumir la API
---------------------------------------

- Ver baseURL y CORS
- Revisar si hay autenticación y cómo incluir tokens
- Crear tipos TypeScript desde modelos Java (manualmente o con herramientas como openapi-generator si tienes spec)
- Probar endpoints con Postman/Insomnia antes de integrar al frontend

---

Si quieres, puedo:

- Generar los archivos TypeScript de tipos y el hook `usePartida.ts` en `src` del frontend de ejemplo.
- Generar un ejemplo completo de página Next.js que muestre la lista de cartas y permita crear y unirse a partidas.

Marca la opción que prefieras y lo implemento dentro del workspace.
