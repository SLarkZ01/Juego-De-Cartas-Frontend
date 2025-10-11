# 🎮 Juego de Cartas - Frontend

Frontend de juego de cartas multijugador en tiempo real basado en Dragon Ball. Construido con Next.js 15, TypeScript, y WebSockets.

## 🚀 Características

- ✅ **Autenticación JWT** - Sistema completo de registro y login
- ✅ **Partidas en Tiempo Real** - WebSocket con STOMP para comunicación instantánea
- ✅ **Sistema de Turnos** - Gestión automática de turnos entre jugadores
- ✅ **Transformaciones** - Sistema de power-ups para las cartas
- ✅ **Arquitectura SOLID** - Código organizado y mantenible
- ✅ **TypeScript** - Tipado fuerte en todo el proyecto
- ✅ **Responsive Design** - Funciona en desktop y móvil

## 📋 Requisitos Previos

- Node.js 18+ y npm
- Backend del juego corriendo (puerto 8080)
- Variables de entorno configuradas

## 🔧 Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <tu-repositorio>
   cd frontendjuegocartas
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edita `.env.local` y configura:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8080
   NEXT_PUBLIC_WS_URL=http://localhost:8080/ws
   ```

4. **Iniciar el servidor de desarrollo**
   ```bash
   npm run dev
   ```

   La aplicación estará disponible en `http://localhost:3000`

## 🏗️ Estructura del Proyecto

```
frontendjuegocartas/
├── app/                      # Páginas de Next.js (App Router)
│   ├── login/               # Página de inicio de sesión
│   ├── register/            # Página de registro
│   ├── jugar/               # Página para crear/unirse a partidas
│   └── partida/[codigo]/    # Página del juego en tiempo real
├── components/              # Componentes reutilizables
│   ├── auth/               # Componentes de autenticación
│   ├── game/               # Componentes del juego
│   └── ui/                 # Componentes UI base
├── contexts/               # Context API de React
│   └── AuthContext.tsx     # Contexto de autenticación
├── hooks/                  # Custom React Hooks
│   └── usePartida.ts       # Hook para gestión de partidas
├── lib/                    # Utilidades y configuración
│   ├── api.ts             # Cliente Axios con interceptores
│   └── websocket.ts       # Cliente WebSocket/STOMP
├── services/              # Servicios (Patrón Repository)
│   ├── auth.service.ts    # Servicio de autenticación
│   └── partida.service.ts # Servicios de partidas y gameplay
├── types/                 # Tipos TypeScript
│   └── api.ts            # Interfaces del API
└── docs/                 # Documentación del backend

```

## 🎯 Flujo de Uso

### 1. Autenticación

1. **Registro**: Navega a `/register` y crea una cuenta
   - Username: 3-20 caracteres (único)
   - Email: válido (único)
   - Password: mínimo 6 caracteres

2. **Login**: Inicia sesión en `/login`
   - Usa username o email
   - El token JWT se guarda automáticamente

### 2. Crear/Unirse a Partida

1. Ve a `/jugar` (requiere autenticación)
2. **Crear Partida**:
   - Crea una nueva partida
   - Comparte el código con otros jugadores
   - Inicia cuando haya mínimo 2 jugadores

3. **Unirse a Partida**:
   - Ingresa el código de 6 caracteres
   - Únete a una partida existente

### 3. Jugar

1. Espera tu turno (indicado con borde naranja pulsante)
2. Selecciona un atributo de tu carta
3. Juega tu carta
4. Usa transformaciones para potenciar tus atributos
5. ¡El jugador con todas las cartas gana!

## 🔌 Conexión con el Backend

### Endpoints Principales

```typescript
// Autenticación
POST /auth/register        // Registro
POST /auth/login          // Login
POST /auth/logout         // Logout

// Partidas
POST /api/partidas/crear                    // Crear partida
POST /api/partidas/{codigo}/unirse          // Unirse
GET  /api/partidas/{codigo}/detalle         // Obtener estado
POST /api/partidas/{codigo}/iniciar         // Iniciar juego

// Gameplay
POST /api/partidas/{codigo}/seleccionar-atributo
POST /api/partidas/{codigo}/jugar
POST /api/partidas/{codigo}/transformaciones/activar
POST /api/partidas/{codigo}/transformaciones/desactivar
```

### WebSocket

```typescript
// Suscripción a eventos
SUBSCRIBE /topic/partida/{codigo}

// Enviar acciones
SEND /app/partida/{codigo}/accion
```

## 🛠️ Tecnologías Utilizadas

- **Next.js 15** - Framework React con App Router
- **TypeScript** - Tipado estático
- **Tailwind CSS** - Estilos utility-first
- **Axios** - Cliente HTTP
- **STOMP + SockJS** - WebSocket en tiempo real
- **Radix UI** - Componentes UI accesibles
- **Lucide React** - Iconos

## 📚 Servicios y Arquitectura

### Principios SOLID Aplicados

- **S**ingle Responsibility: Cada servicio tiene una responsabilidad única
  - `AuthService`: Solo autenticación
  - `PartidaService`: Solo gestión de partidas
  - `GameplayService`: Solo mecánicas de juego

- **O**pen/Closed: Servicios extensibles sin modificar código existente

- **L**iskov Substitution: Interfaces consistentes

- **I**nterface Segregation: Interfaces específicas por funcionalidad

- **D**ependency Inversion: Dependencias a abstracciones (hooks, contexts)

### Manejo de Estado

- **AuthContext**: Estado global de autenticación
- **usePartida Hook**: Estado local de partida con WebSocket
- **SWR** (opcional): Caché y revalidación de datos

## 🐛 Troubleshooting

### Error de conexión al backend

```bash
Error: Network Error
```
**Solución**: Verifica que el backend esté corriendo en `http://localhost:8080`

### WebSocket no conecta

```bash
WebSocket connection failed
```
**Solución**: 
1. Verifica CORS en el backend
2. Confirma que el backend permite origen `http://localhost:3000`
3. Revisa la variable `NEXT_PUBLIC_WS_URL`

### Token expirado

```bash
401 Unauthorized
```
**Solución**: Cierra sesión y vuelve a iniciar sesión. El token tiene un tiempo de expiración.

## 📝 Comandos Útiles

```bash
npm run dev          # Desarrollo (puerto 3000)
npm run build        # Build para producción
npm run start        # Servidor de producción
npm run lint         # Linter
```

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

## 👥 Autores

- Tu Nombre - [@TuGitHub](https://github.com/SLarkZ01)

## 🙏 Agradecimientos

- Dragon Ball API para las cartas
- Comunidad de Next.js
- Contribuidores del proyecto
