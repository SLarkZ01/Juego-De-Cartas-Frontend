# Guía de Integración Backend con Next.js

Esta guía detalla cómo integrar el backend del Juego de Cartas con una aplicación Next.js.

## 📋 Tabla de Contenidos

- [Configuración Inicial](#configuración-inicial)
- [Sistema de Autenticación](#sistema-de-autenticación)
- [Gestión de Partidas](#gestión-de-partidas)
- [WebSockets para Juego en Tiempo Real](#websockets-para-juego-en-tiempo-real)
- [Manejo de Errores](#manejo-de-errores)
- [Ejemplos Completos](#ejemplos-completos)

## 🚀 Configuración Inicial

### 1. Variables de Entorno

Crea un archivo `.env.local` en tu proyecto Next.js:

  // incluir partidaCodigo si está disponible para acelerar la asociación en el servidor
  client.publish({
    destination: '/app/partida/registrar',
    body: JSON.stringify({ jugadorId: user.userId, partidaCodigo }),
    skipContentLengthHeader: true
  });
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
```

### 2. Instalación de Dependencias

```bash
npm install axios @stomp/stompjs sockjs-client
```

### 3. Configuración de Axios

Crea `lib/axios.ts`:

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,  // ✅ IMPORTANTE: Necesario para CORS con autenticación
});

// Interceptor para añadir el token en cada petición
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inválido
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## 🔐 Sistema de Autenticación

### Registro de Usuario

#### Endpoint
```
POST /auth/register
```

#### Request Body
```typescript
interface RegisterRequest {
  username: string;  // 3-20 caracteres, único
  email: string;     // Formato email válido, único
  password: string;  // Mínimo 6 caracteres
}
```

#### Response
```typescript
interface AuthResponse {
  token: string;      // JWT token
  userId: string;     // ID del usuario en MongoDB
  username: string;   // Username (usado en partidas)
  email: string;      // Email del usuario
}
```

#### Ejemplo de Implementación

```typescript
// services/auth.service.ts
import api from '@/lib/axios';

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export interface LoginData {
  username: string;  // Puede ser username o email
  password: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
  username: string;
  email: string;
}

export const authService = {
  // Registro de nuevo usuario
  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/register', data);
    
    // Guardar token y datos de usuario
    localStorage.setItem('token', response.data.token);
    localStorage.setItem('user', JSON.stringify(response.data));
    
    return response.data;
  },

  // Login (acepta username o email)
  login: async (data: LoginData): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', data);
    
    // Guardar token y datos de usuario
    localStorage.setItem('token', response.data.token);
    localStorage.setItem('user', JSON.stringify(response.data));
    
    return response.data;
  },

  // Logout
  // Logout: llama al endpoint backend y limpia el estado local.
  // El backend devuelve 200 OK (stateless JWT); la invalidación real
  // requiere una blacklist si se desea revocar tokens antes de expirar.
  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignorar errores de red/servidor aquí; igual limpiamos el cliente
      console.warn('Logout request failed, clearing local state anyway.');
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  // Obtener usuario actual
  getCurrentUser: (): AuthResponse | null => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  // Verificar si está autenticado
  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('token');
  },
};
```

#### Componente de Registro

```typescript
// components/RegisterForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/auth.service';

export default function RegisterForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authService.register(formData);
      router.push('/dashboard'); // Redirigir al dashboard
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          required
          minLength={3}
          maxLength={20}
          className="w-full p-2 border rounded"
        />
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
          className="w-full p-2 border rounded"
        />
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required
          minLength={6}
          className="w-full p-2 border rounded"
        />
      </div>

      {error && <p className="text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
      >
        {loading ? 'Registrando...' : 'Registrarse'}
      </button>
    </form>
  );
}
```

#### Componente de Login

```typescript
// components/LoginForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/auth.service';

export default function LoginForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: '', // Puede ser username o email
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authService.login(formData);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Credenciales inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="username">Username o Email</label>
        <input
          id="username"
          type="text"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          required
          placeholder="username o email@ejemplo.com"
          className="w-full p-2 border rounded"
        />
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required
          className="w-full p-2 border rounded"
        />
      </div>

      {error && <p className="text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
      >
        {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
      </button>
    </form>
  );
}
```

### Protección de Rutas

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const isAuthPage = request.nextUrl.pathname.startsWith('/login') || 
                     request.nextUrl.pathname.startsWith('/register');

  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (token && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

---

## 🎮 Gestión de Partidas

### Tipos TypeScript

```typescript
// types/game.types.ts

export interface Jugador {
  userId: string;
  nombre: string;      // Username del usuario
  orden: number;       // 1-7
  ki: number;
  transformacionActual: string | null;
  cartasEnMano: Carta[];
  mazo: string[];
  descarte: string[];
}

export interface Partida {
  id: string;
  codigo: string;      // Código de 6 dígitos
  estado: 'ESPERANDO' | 'EN_CURSO' | 'FINALIZADA';
  jugadores: Jugador[];
  turnoActual: number;
  direccion: 'HORARIO' | 'ANTIHORARIO';
  fechaCreacion: string;
  creadorId: string;
}

export interface Carta {
  id: string;
  codigo: string;
  nombre: string;
  imagenUrl: string;
  atributos: Record<string, any>;
}
```

### Servicio de Partidas

```typescript
// services/game.service.ts
import api from '@/lib/axios';
import { Partida } from '@/types/game.types';

export const gameService = {
  // Crear nueva partida
  crearPartida: async (): Promise<Partida> => {
    const response = await api.post<Partida>('/api/partidas/crear');
    return response.data;
  },

  // Unirse a partida por código
  unirsePartida: async (codigo: string): Promise<Partida> => {
    const response = await api.post<Partida>(`/api/partidas/${codigo}/unirse`);
    return response.data;
  },

  // Obtener partida actual del usuario
  getPartidaActual: async (): Promise<Partida> => {
    const response = await api.get<Partida>('/api/partidas/actual');
    return response.data;
  },

  // Salir de partida
  salirPartida: async (partidaId: string): Promise<void> => {
    await api.post(`/api/partidas/${partidaId}/salir`);
  },

  // Iniciar partida manualmente (si aún no ha empezado)
  iniciarPartida: async (partidaId: string): Promise<Partida> => {
    const response = await api.post<Partida>(`/api/partidas/${partidaId}/iniciar`);
    return response.data;
  },
};
```

### Componente para Crear Partida

```typescript
// components/CreateGame.tsx
'use client';

import { useState } from 'react';
import { gameService } from '@/services/game.service';
import { Partida } from '@/types/game.types';

export default function CreateGame() {
  const [partida, setPartida] = useState<Partida | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateGame = async () => {
    setLoading(true);
    setError('');

    try {
      const nuevaPartida = await gameService.crearPartida();
      setPartida(nuevaPartida);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear partida');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <button
        onClick={handleCreateGame}
        disabled={loading}
        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-400"
      >
        {loading ? 'Creando...' : 'Crear Nueva Partida'}
      </button>

      {error && <p className="text-red-500 mt-2">{error}</p>}

      {partida && (
        <div className="mt-4 p-4 border rounded bg-white shadow">
          <h3 className="text-xl font-bold">¡Partida Creada!</h3>
          <p className="text-2xl font-mono my-2">Código: {partida.codigo}</p>
          <p className="text-sm text-gray-600">
            Comparte este código con otros jugadores
          </p>
          <p className="mt-2">
            Jugadores: {partida.jugadores.length}/7
          </p>
          <ul className="mt-2">
            {partida.jugadores.map((jugador) => (
              <li key={jugador.userId}>
                {jugador.orden}. {jugador.nombre}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-2">
            La partida iniciará automáticamente cuando se una el 7º jugador
            o cuando el creador la inicie manualmente (mínimo 2 jugadores).
          </p>
        </div>
      )}
    </div>
  );
}
```

### Componente para Unirse a Partida

```typescript
// components/JoinGame.tsx
'use client';

import { useState } from 'react';
import { gameService } from '@/services/game.service';

export default function JoinGame() {
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await gameService.unirsePartida(codigo);
      setSuccess(true);
      setCodigo('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al unirse a la partida');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleJoinGame} className="space-y-4">
      <div>
        <label htmlFor="codigo" className="block mb-2">
          Código de Partida
        </label>
        <input
          id="codigo"
          type="text"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="Ej: ABC123"
          maxLength={6}
          required
          className="w-full p-2 border rounded font-mono text-center text-xl"
        />
      </div>

      {error && <p className="text-red-500">{error}</p>}
      {success && <p className="text-green-500">¡Te has unido a la partida!</p>}

      <button
        type="submit"
        disabled={loading || codigo.length !== 6}
        className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
      >
        {loading ? 'Uniéndose...' : 'Unirse a Partida'}
      </button>
    </form>
  );
}
```

---

## 🔌 WebSockets para Juego en Tiempo Real

### Configuración de WebSocket Client

```typescript
// lib/websocket.ts
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export class GameWebSocket {
  private client: Client;
  private partidaId: string;
  private connected: boolean = false;

  constructor(partidaId: string, token: string) {
    this.partidaId = partidaId;

    this.client = new Client({
      webSocketFactory: () => new SockJS(process.env.NEXT_PUBLIC_WS_URL!),
      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },
      debug: (str) => {
        console.log('STOMP:', str);
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });
  }

  connect(callbacks: {
    onConnect?: () => void;
    onPartidaUpdate?: (partida: any) => void;
    onEventoJuego?: (evento: any) => void;
    onError?: (error: any) => void;
  }) {
    this.client.onConnect = () => {
      console.log('WebSocket conectado');
      this.connected = true;

      // Suscribirse a actualizaciones de la partida
      // Nota: el backend ahora publica un objeto `PartidaResponse` completo
      // (ej: { codigo, jugadorId, jugadores: [...] }) en /topic/partida/{codigo}.
      // También puede publicar mensajes más detallados (PartidaDetailResponse)
      // dependiendo del evento. Aquí parseamos el payload y lo reenviamos
      // al hook mediante `onPartidaUpdate`.
      this.client.subscribe(`/topic/partida/${this.partidaId}`, (message) => {
        const payload = JSON.parse(message.body);
        // payload puede ser PartidaResponse o PartidaDetailResponse
        callbacks.onPartidaUpdate?.(payload);
      });

      // Suscribirse a eventos de juego específicos (opcional)
      this.client.subscribe(`/topic/partida/${this.partidaId}/eventos`, (message) => {
        const evento = JSON.parse(message.body);
        callbacks.onEventoJuego?.(evento);
      });

      callbacks.onConnect?.();
    };

    this.client.onStompError = (frame) => {
      console.error('Error STOMP:', frame);
      callbacks.onError?.(frame);
    };

    this.client.activate();
  }

  // Jugar carta
  jugarCarta(cartaId: string, targetJugadorId?: string) {
    if (!this.connected) {
      throw new Error('WebSocket no conectado');
    }

    this.client.publish({
      destination: `/app/partida/${this.partidaId}/jugar`,
      body: JSON.stringify({
        cartaId,
        targetJugadorId,
      }),
    });
  }

  // Robar carta
  robarCarta() {
    if (!this.connected) {
      throw new Error('WebSocket no conectado');
    }

    this.client.publish({
      destination: `/app/partida/${this.partidaId}/robar`,
      body: JSON.stringify({}),
    });
  }

  // Usar transformación
  usarTransformacion(transformacionCodigo: string) {
    if (!this.connected) {
      throw new Error('WebSocket no conectado');
    }

    this.client.publish({
      destination: `/app/partida/${this.partidaId}/transformar`,
      body: JSON.stringify({
        transformacionCodigo,
      }),
    });
  }

  disconnect() {
    if (this.client) {
      this.client.deactivate();
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
```

### Reconexión y registro de sesión (nuevo)

Para evitar que un jugador pierda su plaza al recargar la página, el backend ahora soporta dos mecanismos de reconexión:

- Registro de la sesión WebSocket: al conectar por STOMP el cliente debe enviar su `jugadorId` (si lo conserva) a `/app/partida/registrar`. El servidor guardará la asociación sessionId->jugadorId y, en caso de desconexión, marcará al jugador como desconectado y publicará el estado actualizado de la partida.
- Endpoint REST de reconexión: si el frontend detecta que la sesión WS se perdió (recarga) puede llamar a `POST /api/partidas/{codigo}/reconectar` para que el servidor marque al jugador como conectado nuevamente. Este endpoint acepta opcionalmente `{ "jugadorId": "..." }` en el body; si no se provee, el backend intentará reconectar usando el usuario autenticado (token JWT).

Ejemplo de uso (cliente):

1) Al conectar el WebSocket, después de `onConnect` envía el registro del jugador:

```typescript
// después de client.activate() y onConnect
const user = authService.getCurrentUser();
if (user?.userId) {
  client.publish({
    destination: '/app/partida/registrar',
    body: JSON.stringify({ jugadorId: user.userId, partidaCodigo: codigo }),
    skipContentLengthHeader: true
  });
}
```

2) Si el cliente se recarga y quiere reconectar (por ejemplo en useEffect al montar), llamar al endpoint REST:

```typescript
// reconectar por jugadorId (si lo tengo guardado en localStorage)
const reconectar = async (codigo: string) => {
  const user = authService.getCurrentUser();
  try {
    if (user?.userId) {
      await api.post(`/api/partidas/${codigo}/reconectar`, { jugadorId: user.userId });
    } else {
      // si no hay user en el cliente, el endpoint intentará usar el token para identificar
      await api.post(`/api/partidas/${codigo}/reconectar`);
    }
  } catch (err) {
    console.error('Error reconectando a la partida', err);
  }
};
```

### Ejemplo práctico: hook simple para el lobby

Este hook muestra cómo combinar la llamada REST de reconexión opcional, el registro STOMP y la suscripción al topic. El servidor publicará inmediatamente el `PartidaResponse` al suscribirse, por lo que el hook simplemente actualiza la lista de jugadores cuando llega el payload.

```typescript
import { useEffect, useRef, useState } from 'react';
import SockJS from 'sockjs-client';
import { Client, IMessage } from '@stomp/stompjs';
import api from '@/lib/axios';
import { authService } from '@/services/auth.service';

export function useLobby(partidaCodigo: string) {
  const clientRef = useRef<Client | null>(null);
  const [jugadores, setJugadores] = useState<any[]>([]);

  useEffect(() => {
    const user = authService.getCurrentUser();
    let mounted = true;

    const start = async () => {
      if (user?.userId) {
        try {
          await api.post(`/api/partidas/${partidaCodigo}/reconectar`, { jugadorId: user.userId });
        } catch (e) {
          // puede fallar si el jugador no está en la partida; ignorar
        }
      }

      const socket = new SockJS(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080/ws');
      const client = new Client({ webSocketFactory: () => socket });

      client.onConnect = () => {
        if (!mounted) return;
        // registrar sesión WS con jugadorId y partidaCodigo
        if (user?.userId) {
          client.publish({
            destination: '/app/partida/registrar',
            body: JSON.stringify({ jugadorId: user.userId, partidaCodigo }),
            skipContentLengthHeader: true
          });
        }

        client.subscribe(`/topic/partida/${partidaCodigo}`, (msg: IMessage) => {
          const payload = JSON.parse(msg.body);
          if (payload && Array.isArray(payload.jugadores)) {
            setJugadores(payload.jugadores);
          }
        });
      };

      client.activate();
      clientRef.current = client;
    };

    start();

    return () => {
      mounted = false;
      clientRef.current?.deactivate();
    };
  }, [partidaCodigo]);

  return { jugadores };
}

---

Ejemplo listo para copiar/pegar (hook + Lobby render)

```typescript
// hooks/useLobbyRealTime.ts
import { useEffect, useRef, useState } from 'react';
import SockJS from 'sockjs-client';
import { Client, IMessage } from '@stomp/stompjs';
import api from '@/lib/axios';

export interface JugadorDTO {
  id: string;
  nombre: string;
  conectado?: boolean;
}

export function useLobbyRealTime(partidaCodigo: string | null, jugadorId?: string | null) {
  const clientRef = useRef<Client | null>(null);
  const [jugadores, setJugadores] = useState<JugadorDTO[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!partidaCodigo) return;

    let mounted = true;

    const doReconnectREST = async () => {
      if (!jugadorId) return;
      try {
        await api.post(`/api/partidas/${partidaCodigo}/reconectar`, { jugadorId });
      } catch (e) {
        console.warn('Reconectar REST falló', e);
      }
    };

    const socket = new SockJS(`${process.env.NEXT_PUBLIC_WS_URL}`);
    const client = new Client({
      webSocketFactory: () => socket,
      debug: () => {},
      onConnect: () => {
        setConnected(true);
        if (jugadorId) {
          client.publish({
            destination: '/app/partida/registrar',
            body: JSON.stringify({ jugadorId, partidaCodigo }),
            skipContentLengthHeader: true,
          });
        }
        client.subscribe(`/topic/partida/${partidaCodigo}`, (msg: IMessage) => {
          try {
            const payload = JSON.parse(msg.body);
            if (payload && Array.isArray(payload.jugadores)) {
              if (mounted) setJugadores(payload.jugadores);
            } else if (payload.partida && payload.partida.jugadores) {
              if (mounted) setJugadores(payload.partida.jugadores);
            }
          } catch (err) {
            console.error('Error parseando mensaje WS', err);
          }
        });
      },
      onDisconnect: () => setConnected(false),
      onStompError: (err) => console.error('STOMP error', err),
    });

    (async () => {
      await doReconnectREST();
      client.activate();
      clientRef.current = client;
    })();

    return () => {
      mounted = false;
      client.deactivate();
    };
  }, [partidaCodigo, jugadorId]);

  const renderJugadores = (meId?: string | null) =>
    jugadores.map((j) => ({ ...j, isMe: !!meId && j.id === meId }));

  return { jugadores: renderJugadores(jugadorId), connected };
}
```

```tsx
// components/Lobby.tsx (fragmento)
import React from 'react';
import { useLobbyRealTime } from '@/hooks/useLobbyRealTime';

export default function Lobby({ partidaCodigo, currentPlayerId }: { partidaCodigo: string; currentPlayerId?: string | null; }) {
  const { jugadores } = useLobbyRealTime(partidaCodigo, currentPlayerId);

  return (
    <ul>
      {jugadores.map(p => (
        <li key={p.id} style={{ fontWeight: (p as any).isMe ? 700 : 400 }}>
          {p.nombre} {(p as any).isMe ? ' (Tú)' : ''} {p.conectado ? '🟢' : '🔴'}
        </li>
      ))}
    </ul>
  );
}
```
```

### Grace period en reconexiones (nuevo)

El backend aplica ahora un grace period de 5 segundos antes de marcar a un jugador como desconectado. Esto reduce el flicker en el lobby cuando el usuario recarga la página.

Qué hace el cliente para aprovecharlo:

1. Al montar la página intenta (opcional) reconectar por REST: POST /api/partidas/{codigo}/reconectar con `{ jugadorId }`.
2. Abre la conexión WS y publica a `/app/partida/registrar` con `{ jugadorId, partidaCodigo }` lo antes posible en `onConnect`.
3. Suscríbete a `/topic/partida/{codigo}` — el servidor publicará inmediatamente el `PartidaResponse` y, si la reconexión fue exitosa, `jugador.conectado` permanecerá en `true`.

Si el usuario recarga y vuelve a conectar dentro de los 5 segundos, el servidor cancelará el marcado como desconectado y no verás el estado "desconectado" en el lobby.


3) Después de llamar al endpoint REST, volver a abrir la conexión WS y suscribirse a `/topic/partida/{codigo}` — el servidor publicará inmediatamente un `PartidaResponse` actualizado con la bandera `conectado=true` para el jugador.

Notas importantes:

- El backend publica siempre `PartidaResponse` con la lista completa de jugadores en `/topic/partida/{codigo}`; el frontend debe observar `jugadores[].conectado` para mostrar estados de conexión en el lobby.
- Si quieres mayor robustez (por ejemplo tolerar reinicio del servidor), considera guardar el mapping session->jugador en Redis y recuperar al reactivar la instancia.

Nota importante sobre sincronización de estado:

- Para evitar condiciones de carrera el servidor publica el estado canónico de la partida inmediatamente después de que detecta una nueva suscripción a `/topic/partida/{codigo}`. En la práctica esto significa que, después de reconectar vía REST o reabrir la conexión WS, basta con suscribirse al topic: el servidor enviará el `PartidaResponse` actual y el cliente no debería perder eventos publicados justo antes de la suscripción.

Sección para el Copilot del Frontend (qué cambió y acciones recomendadas)

- Cambios aplicados en el backend:
  - Reconexión por REST: `POST /api/partidas/{codigo}/reconectar` (opcional body `{ jugadorId }`). Marca al jugador como conectado y publica el `PartidaResponse` actualizado.
  - Registro STOMP: destino `/app/partida/registrar` acepta payload `{ jugadorId, partidaCodigo }`. Asociará la sesión WebSocket con `jugadorId` y, si se incluye `partidaCodigo`, marcará al jugador como conectado en esa partida.
  - Grace period configurables: propiedad Spring `app.disconnect.graceSeconds` (valor en segundos). Por defecto `5`.
  - Sincronización local: para evitar carreras entre la tarea de desconexión y la cancelación por reconexión, el backend usa una sincronización por `jugadorId` en memoria (válida para despliegues single-instance). En despliegues multinodo se debe coordinar con el equipo de backend para usar un lock distribuido (por ejemplo Redis/Redisson) o persistir el mapping session->jugador.

- Acciones concretas que debe aplicar el Copilot del frontend:
  1. Al montar la vista del lobby, opcionalmente llamar a `POST /api/partidas/{codigo}/reconectar` con `{ jugadorId }` si lo tienes en localStorage. Esto reduce la ventana en la que el jugador podría aparecer desconectado.
  2. Abrir la conexión WS y, en `onConnect`, publicar inmediatamente a `/app/partida/registrar` con `{ jugadorId, partidaCodigo }` (si tienes `partidaCodigo` disponible). Esto asocia la nueva sesión con el jugador y permite que el servidor cancele cualquier desconexión pendiente.
  3. Subscribirse a `/topic/partida/{codigo}` y confiar en el `PartidaResponse` enviado por el servidor para renderizar la lista de jugadores y sus flags `conectado`.
  4. Manejar confirmación: después de la reconexión REST o del registro STOMP, esperar el `PartidaResponse` publicado por el servidor antes de confiar en un cambio de UI persistente.
  5. Para despliegues multinodo, implementar retries y lógica de reintento en el frontend (ej. reintentar `registrar` y `reconectar` varias veces con backoff) y coordinar con backend para habilitar locks distribuidos si se necesita tolerancia a fallos del servidor.



### Hook de React para WebSocket

```typescript
// hooks/useGameWebSocket.ts
import { useEffect, useState, useCallback } from 'react';
import { GameWebSocket } from '@/lib/websocket';
import { Partida } from '@/types/game.types';
import { authService } from '@/services/auth.service';

export function useGameWebSocket(partidaId: string | null) {
  const [ws, setWs] = useState<GameWebSocket | null>(null);
  const [partida, setPartida] = useState<Partida | null>(null);
  const [connected, setConnected] = useState(false);
  const [eventos, setEventos] = useState<any[]>([]);

  useEffect(() => {
    if (!partidaId) return;

    const user = authService.getCurrentUser();
    if (!user?.token) return;

    const websocket = new GameWebSocket(partidaId, user.token);

    websocket.connect({
      onConnect: () => {
        console.log('WebSocket conectado a partida:', partidaId);
        setConnected(true);
      },
      onPartidaUpdate: (updatedPartida) => {
        console.log('Actualización de partida (payload):', updatedPartida);
        // El backend publica ahora un PartidaResponse completo.
        // Si recibimos ese objeto, actualizamos el estado `partida` con él.
        if (updatedPartida && Array.isArray(updatedPartida.jugadores)) {
          setPartida(updatedPartida as unknown as Partida);
        } else if (updatedPartida && updatedPartida.partida) {
          // En algunos casos el payload puede estar anidado
          setPartida(updatedPartida.partida as Partida);
        } else {
          // Fallback: asignar directamente
          setPartida(updatedPartida as unknown as Partida);
        }
      },
      onEventoJuego: (evento) => {
        console.log('Evento de juego:', evento);
        setEventos((prev) => [...prev, evento]);
      },
      onError: (error) => {
        console.error('Error WebSocket:', error);
        setConnected(false);
      },
    });

    setWs(websocket);

    return () => {
      websocket.disconnect();
    };
  }, [partidaId]);

  const jugarCarta = useCallback(
    (cartaId: string, targetJugadorId?: string) => {
      ws?.jugarCarta(cartaId, targetJugadorId);
    },
    [ws]
  );

  const robarCarta = useCallback(() => {
    ws?.robarCarta();
  }, [ws]);

  const usarTransformacion = useCallback(
    (transformacionCodigo: string) => {
      ws?.usarTransformacion(transformacionCodigo);
    },
    [ws]
  );

  return {
    partida,
    connected,
    eventos,
    jugarCarta,
    robarCarta,
    usarTransformacion,
  };
}
```

### Componente de Juego en Tiempo Real

```typescript
// components/GameBoard.tsx
'use client';

import { useGameWebSocket } from '@/hooks/useGameWebSocket';
import { authService } from '@/services/auth.service';

interface GameBoardProps {
  partidaId: string;
}

export default function GameBoard({ partidaId }: GameBoardProps) {
  const { partida, connected, jugarCarta, robarCarta, usarTransformacion } = 
    useGameWebSocket(partidaId);
  const user = authService.getCurrentUser();

  if (!connected) {
    return <div>Conectando al juego...</div>;
  }

  if (!partida) {
    return <div>Cargando partida...</div>;
  }

  const jugadores = partida.jugadores || [];
  const jugadorActual = jugadores.find(j => j.userId === user?.userId);
  const turnoIndex = typeof partida.turnoActual === 'number' ? partida.turnoActual : Number(partida.turnoActual || 0);
  const esMiTurno = jugadores[turnoIndex] ? jugadores[turnoIndex].userId === user?.userId : false;

  return (
    <div className="game-board p-4">
      <div className="game-info bg-gray-100 p-4 rounded mb-4">
        <h2 className="text-2xl font-bold">Partida: {partida.codigo}</h2>
        <p>Estado: {partida.estado}</p>
        <p>Turno: Jugador {partida.turnoActual + 1}</p>
        <p>Dirección: {partida.direccion}</p>
        {esMiTurno && (
          <p className="text-green-600 font-bold">¡Es tu turno!</p>
        )}
      </div>

      {/* Jugadores */}
      <div className="players grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {jugadores.map((jugador, index) => (
          <div
            key={jugador.userId}
            className={`player-card p-4 rounded ${
              index === partida.turnoActual ? 'bg-yellow-100 border-2 border-yellow-500' : 'bg-white border'
            } ${jugador.userId === user?.userId ? 'ring-2 ring-blue-500' : ''}`}
          >
            <h3 className="font-bold">
              {jugador.nombre}
              {jugador.userId === user?.userId && ' (Tú)'}
            </h3>
            <p>Ki: {jugador.ki ?? 0}</p>
            <p>Transformación: {jugador.transformacionActual || 'Ninguna'}</p>
            <p>Cartas en mano: {jugador.cartasEnMano ? jugador.cartasEnMano.length : jugador.numeroCartas || 0}</p>
          </div>
        ))}
      </div>

      {/* Cartas del jugador actual */}
      {jugadorActual && (
        <div className="my-hand">
          <h3 className="text-xl font-bold mb-2">Tus Cartas</h3>
          <div className="cards flex gap-2 overflow-x-auto">
            {jugadorActual.cartasEnMano.map((carta) => (
              <button
                key={carta.id}
                onClick={() => esMiTurno && jugarCarta(carta.id)}
                disabled={!esMiTurno}
                className="card border-2 rounded p-2 min-w-[120px] hover:border-blue-500 disabled:opacity-50"
              >
                <img src={carta.imagenUrl} alt={carta.nombre} className="w-full" />
                <p className="text-sm font-bold">{carta.nombre}</p>
              </button>
            ))}
          </div>

          {/* Acciones */}
          <div className="actions mt-4 flex gap-2">
            <button
              onClick={robarCarta}
              disabled={!esMiTurno}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              Robar Carta
            </button>
            
            <button
              onClick={() => usarTransformacion('SSJ1')}
              disabled={!esMiTurno || jugadorActual.ki < 3}
              className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:bg-gray-400"
            >
              Transformar SSJ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## ⚠️ Manejo de Errores

### Tipos de Errores del Backend

```typescript
// types/error.types.ts
export interface ApiError {
  message: string;
  status?: number;
  timestamp?: string;
}
```

### Manejo Centralizado

```typescript
// lib/errorHandler.ts
export const handleApiError = (error: any): string => {
  if (error.response) {
    // Error de respuesta del servidor
    const message = error.response.data?.message || 'Error del servidor';
    
    switch (error.response.status) {
      case 400:
        return message; // Bad Request
      case 401:
        return 'No autorizado. Por favor, inicia sesión nuevamente.';
      case 403:
        return 'No tienes permisos para realizar esta acción.';
      case 404:
        return 'Recurso no encontrado.';
      case 409:
        return message; // Conflict (ej: username ya existe)
      case 500:
        return 'Error interno del servidor.';
      default:
        return message;
    }
  } else if (error.request) {
    // No se recibió respuesta
    return 'No se pudo conectar con el servidor. Verifica tu conexión.';
  } else {
    // Error al configurar la petición
    return error.message || 'Error desconocido';
  }
};
```

### Uso en Componentes

```typescript
import { handleApiError } from '@/lib/errorHandler';

try {
  await gameService.crearPartida();
} catch (err) {
  const errorMessage = handleApiError(err);
  setError(errorMessage);
}
```

---

## 📝 Ejemplos Completos

### Flujo Completo de Autenticación y Juego

```typescript
// app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/auth.service';
import LoginForm from '@/components/LoginForm';
import RegisterForm from '@/components/RegisterForm';

export default function HomePage() {
  const router = useRouter();
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    if (authService.isAuthenticated()) {
      router.push('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-6">
          Juego de Cartas
        </h1>

        {showRegister ? (
          <>
            <RegisterForm />
            <p className="mt-4 text-center">
              ¿Ya tienes cuenta?{' '}
              <button
                onClick={() => setShowRegister(false)}
                className="text-blue-500 hover:underline"
              >
                Inicia Sesión
              </button>
            </p>
          </>
        ) : (
          <>
            <LoginForm />
            <p className="mt-4 text-center">
              ¿No tienes cuenta?{' '}
              <button
                onClick={() => setShowRegister(true)}
                className="text-blue-500 hover:underline"
              >
                Regístrate
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

```typescript
// app/dashboard/page.tsx
'use client';

import { useState } from 'react';
import { authService } from '@/services/auth.service';
import CreateGame from '@/components/CreateGame';
import JoinGame from '@/components/JoinGame';

export default function DashboardPage() {
  const user = authService.getCurrentUser();
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Juego de Cartas</h1>
          <div className="flex items-center gap-4">
            <span>Hola, {user?.username}!</span>
            <button
              onClick={() => {
                authService.logout();
                window.location.href = '/';
              }}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto mt-8 p-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-4 py-2 rounded ${
                activeTab === 'create'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200'
              }`}
            >
              Crear Partida
            </button>
            <button
              onClick={() => setActiveTab('join')}
              className={`px-4 py-2 rounded ${
                activeTab === 'join'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200'
              }`}
            >
              Unirse a Partida
            </button>
          </div>

          {activeTab === 'create' ? <CreateGame /> : <JoinGame />}
        </div>
      </div>
    </div>
  );
}
```

```typescript
// app/game/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import GameBoard from '@/components/GameBoard';

export default function GamePage() {
  const params = useParams();
  const partidaId = params.id as string;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 to-purple-900">
      <GameBoard partidaId={partidaId} />
    </div>
  );
}
```

---

## 🔑 Puntos Clave

### Reglas del Juego

1. **Jugadores**: Mínimo 2, máximo 7
2. **Auto-inicio**: La partida comienza automáticamente cuando se une el 7º jugador
3. **Creador**: El creador de la partida es siempre el Jugador 1
4. **Username**: Se usa el username del usuario registrado como nombre del jugador (único)

### Autenticación

- El token JWT debe incluirse en todas las peticiones a `/api/**`
- Login acepta tanto **username** como **email**
- El username es único y se usa para identificar jugadores

### WebSocket

- Se requiere autenticación con JWT token
- Todos los eventos de juego se transmiten en tiempo real
- Reconexión automática cada 5 segundos

### Endpoints Públicos

- `/auth/register`
- `/auth/login`
- `/auth/logout`
- `/swagger-ui/**`
- `/ws/**` (requiere token en headers)

---

## 📚 Recursos Adicionales

- **OpenAPI Documentation**: `http://localhost:8080/swagger-ui/index.html`
- **WebSocket Endpoint**: `ws://localhost:8080/ws`
- **API Base URL**: `http://localhost:8080`

---

## 🐛 Troubleshooting

### Token Expirado
Si recibes error 401, el token ha expirado. Cierra sesión y vuelve a iniciar.

### WebSocket No Conecta
Verifica que:
1. El backend esté corriendo en el puerto 8080
2. El token JWT sea válido
3. La URL de WebSocket sea correcta

### No Puedo Unirme a Partida
Asegúrate de que:
1. El código de partida sea correcto (6 caracteres)
2. La partida no haya iniciado ya
3. No haya 7 jugadores ya

---

¡Listo para integrar! 🚀
