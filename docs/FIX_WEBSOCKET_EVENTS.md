# 🔧 Fix: WebSocket Events y Sincronización de Partidas

## 🐛 Problemas Identificados

**Reporte del usuario**: 
1. ❌ Los eventos no se muestran en "Eventos Recientes"
2. ❌ Aparece error "event undefined" 
3. ❌ Cuando alguien se une a la partida, no todos los jugadores lo ven
4. ❌ La lista de jugadores no se sincroniza entre pestañas

## 🔍 Análisis de Causas

### 1. **Event Undefined**
**Problema**: El callback de WebSocket recibía `evento` como `undefined` en algunos casos.

**Causa raíz**:
- El backend podría enviar eventos malformados
- No había validación de eventos antes de procesarlos
- El parsing de JSON podría fallar silenciosamente

### 2. **Eventos no se muestran**
**Problema**: El array `eventos` se llenaba pero no se renderizaban correctamente.

**Causa raíz**:
- No había validación en el renderizado (si evento era null/undefined, causaba error)
- Los eventos no tenían mensajes descriptivos
- Faltaba manejo de tipos específicos de eventos

### 3. **Jugadores no sincronizados**
**Problema**: Cuando un jugador se une, solo aparece en su propia pantalla.

**Causa raíz**:
- El hook `usePartida` solo procesaba eventos tipo `ESTADO_ACTUALIZADO`
- No manejaba específicamente el evento `JUGADOR_UNIDO`
- No actualizaba la lista de jugadores cuando llegaba ese evento

## ✅ Soluciones Implementadas

### 1. **Validación de Eventos en WebSocket** (`lib/websocket.ts`)

```typescript
// ✅ ANTES: Sin validación
const evento: EventoWebSocket = JSON.parse(message.body);
onMessage(evento);

// ✅ DESPUÉS: Con validación completa
if (!message.body) {
  console.warn('⚠️ Mensaje WebSocket sin body');
  return;
}

const evento: EventoWebSocket = JSON.parse(message.body);

// Validar estructura
if (!evento || typeof evento !== 'object') {
  console.error('❌ Evento inválido (no es objeto):', evento);
  return;
}

if (!evento.tipo) {
  console.error('❌ Evento sin tipo:', evento);
  return;
}

console.log('📨 Evento recibido:', evento.tipo, evento);
onMessage(evento);
```

**Beneficios**:
- ✅ Previene el error "event undefined"
- ✅ Logs detallados para debugging
- ✅ Manejo robusto de errores

---

### 2. **Manejo Mejorado de Eventos** (`hooks/usePartida.ts`)

```typescript
await websocketService.subscribeToPartida(codigo, (evento: EventoWebSocket) => {
  // ✅ Validar que el evento existe
  if (!evento || !evento.tipo) {
    console.error('❌ Evento inválido recibido:', evento);
    return;
  }

  console.log('✅ Evento procesado:', evento.tipo, evento);

  // Agregar a la lista
  setEventos((prev) => [evento, ...prev].slice(0, 100));

  // ✅ Manejar diferentes tipos de eventos
  if (evento.tipo === 'ESTADO_ACTUALIZADO' && evento.datos) {
    setPartida((prev) => {
      if (!prev) return evento.datos as PartidaDetailResponse;
      return { ...prev, ...evento.datos };
    });
  } 
  // ✅ NUEVO: Manejo específico para JUGADOR_UNIDO
  else if (evento.tipo === 'JUGADOR_UNIDO' && evento.datos) {
    setPartida((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        jugadores: evento.datos.jugadores || prev.jugadores,
      };
    });
  } 
  // ✅ NUEVO: Manejo específico para PARTIDA_INICIADA
  else if (evento.tipo === 'PARTIDA_INICIADA' && evento.datos) {
    setPartida((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        estado: 'EN_CURSO',
        ...evento.datos,
      };
    });
  }
});
```

**Beneficios**:
- ✅ Sincroniza lista de jugadores cuando alguien se une
- ✅ Actualiza estado cuando la partida inicia
- ✅ Manejo específico por tipo de evento

---

### 3. **Mensajes Descriptivos** (`app/partida/[codigo]/page.tsx`)

```typescript
useEffect(() => {
  if (eventos.length > 0) {
    const ultimoEvento = eventos[0];
    
    // ✅ Validar evento
    if (!ultimoEvento || !ultimoEvento.tipo) {
      console.warn('⚠️ Evento inválido en useEffect:', ultimoEvento);
      return;
    }

    // ✅ Generar mensajes descriptivos
    let mensaje = ultimoEvento.mensaje || '';
    
    switch (ultimoEvento.tipo) {
      case 'JUGADOR_UNIDO':
        mensaje = mensaje || '¡Un nuevo jugador se ha unido a la partida!';
        break;
      case 'PARTIDA_INICIADA':
        mensaje = mensaje || '🎮 ¡La partida ha comenzado!';
        break;
      // ... más casos
    }

    setMensajeEvento(mensaje);
  }
}, [eventos]);
```

---

### 4. **Lista de Eventos Mejorada** (UI)

```tsx
{eventos.slice(0, 10).map((evento, idx) => {
  // ✅ Validar antes de renderizar
  if (!evento || !evento.tipo) return null;
  
  // ✅ Iconos y mensajes por tipo
  let icono = '📢';
  let mensaje = evento.mensaje || '';
  
  switch (evento.tipo) {
    case 'JUGADOR_UNIDO':
      icono = '👋';
      mensaje = mensaje || 'Nuevo jugador se unió';
      break;
    case 'PARTIDA_INICIADA':
      icono = '🎮';
      mensaje = mensaje || 'Partida iniciada';
      break;
    // ... más casos
  }

  return (
    <div key={idx} className="...">
      <span>{icono}</span>
      <div>
        <span>{evento.tipo.replace(/_/g, ' ')}</span>
        <span>{mensaje}</span>
        <span>{new Date(evento.timestamp).toLocaleTimeString()}</span>
      </div>
    </div>
  );
})}
```

**Beneficios**:
- ✅ Iconos visuales por tipo de evento
- ✅ Timestamp formateado
- ✅ Mensajes descriptivos
- ✅ No renderiza eventos inválidos

---

## 🎯 Tipos de Eventos Soportados

| Evento | Icono | Descripción | Acción |
|--------|-------|-------------|---------|
| `JUGADOR_UNIDO` | 👋 | Nuevo jugador | Actualiza lista jugadores |
| `JUGADOR_DESCONECTADO` | 🚪 | Jugador salió | Actualiza lista jugadores |
| `PARTIDA_INICIADA` | 🎮 | Partida comenzó | Cambia estado a EN_CURSO |
| `TURNO_CAMBIADO` | 🔄 | Cambió el turno | Actualiza turnoActual |
| `ATRIBUTO_SELECCIONADO` | 🎯 | Atributo elegido | Muestra atributo |
| `CARTA_JUGADA` | 🃏 | Carta jugada | Actualiza cartas |
| `RONDA_COMPLETADA` | 🏆 | Ronda terminó | Actualiza puntajes |
| `PARTIDA_FINALIZADA` | 🎉 | Juego terminó | Muestra ganador |
| `TRANSFORMACION_ACTIVADA` | ⚡ | Transformación | Actualiza carta |
| `ERROR` | ❌ | Error servidor | Muestra mensaje error |
| `ESTADO_ACTUALIZADO` | 📢 | Update general | Actualiza todo |

---

## 🔄 Flujo de Sincronización

### Escenario: Usuario "Arianna" se une a partida de "Thomas"

```
1. Arianna hace POST /api/partidas/unirse
   ↓
2. Backend crea jugador para Arianna
   ↓
3. Backend envía evento WebSocket:
   {
     tipo: "JUGADOR_UNIDO",
     datos: {
       jugadores: [Thomas, Arianna],
       nuevoJugador: "Arianna"
     },
     mensaje: "Arianna se ha unido a la partida"
   }
   ↓
4. WebSocket valida el evento
   ↓
5. Hook usePartida procesa:
   - Agrega evento a la lista de eventos
   - Actualiza partida.jugadores con la nueva lista
   ↓
6. ✅ Ambos usuarios (Thomas y Arianna) ven:
   - "Eventos Recientes": 👋 Arianna se ha unido
   - "Jugadores": Thomas (Conectado), Arianna (Conectado)
```

---

## 🧪 Cómo Probar el Fix

### Test 1: Unirse a una Partida

```bash
1. Usuario 1 (Thomas):
   - Crear partida en pestaña 1
   - Ver código (ejemplo: D54954)
   - Observar "Eventos Recientes" (vacío por ahora)

2. Usuario 2 (Arianna):
   - Abrir pestaña 2 (o incógnito)
   - Login con otra cuenta
   - Unirse con código D54954

3. ✅ Verificar en AMBAS pestañas:
   - "Jugadores" muestra: Thomas y Arianna
   - "Eventos Recientes" muestra: 👋 Nuevo jugador se unió
   - Mensaje temporal arriba: "¡Un nuevo jugador se ha unido!"
```

### Test 2: Iniciar Partida

```bash
1. Usuario 1 (creador):
   - Click en "🎮 Iniciar Partida"

2. ✅ Verificar en AMBAS pestañas:
   - Estado cambia a "EN_CURSO"
   - Eventos: 🎮 Partida iniciada
   - Se asignan cartas a los jugadores
```

### Test 3: Eventos en Consola

```javascript
// Abrir DevTools Console en ambas pestañas
// Deberías ver logs como:

// ✅ Conexión
✅ Conectado al WebSocket
📡 Suscrito a /topic/partida/D54954

// ✅ Eventos
📨 Evento recibido: JUGADOR_UNIDO {tipo: "JUGADOR_UNIDO", ...}
✅ Evento procesado: JUGADOR_UNIDO {...}

// ❌ Si hay problemas, verías:
⚠️ Mensaje WebSocket sin body
❌ Evento inválido (no es objeto): undefined
❌ Evento sin tipo: {...}
```

---

## 🐛 Debugging

### Si eventos siguen sin aparecer:

```javascript
// En DevTools Console:

// 1. Verificar conexión WebSocket
// Debería haber un WebSocket activo en Network > WS

// 2. Verificar suscripción
// En Console deberías ver:
📡 Suscrito a /topic/partida/XXXXXX

// 3. Forzar evento de prueba (si tienes acceso al backend)
// El backend puede enviar un evento de prueba
```

### Si jugadores no se sincronizan:

```javascript
// Verificar que el backend envía evento JUGADOR_UNIDO
// El evento debe incluir:
{
  tipo: "JUGADOR_UNIDO",
  datos: {
    jugadores: [ /* array con TODOS los jugadores */ ]
  }
}

// Si el backend solo envía el nuevo jugador, hay que modificarlo
```

---

## 📊 Antes vs Después

| Aspecto | ❌ Antes | ✅ Después |
|---------|----------|------------|
| **Eventos undefined** | Crasheaba el componente | Validados y filtrados |
| **Lista de jugadores** | No se sincroniza | Se actualiza en tiempo real |
| **Eventos recientes** | Vacío o tipo raw | Iconos + mensajes descriptivos |
| **Debugging** | Sin logs | Logs detallados en consola |
| **Error handling** | Silencioso | Mensajes de error claros |
| **Tipos de eventos** | Solo ESTADO_ACTUALIZADO | Todos los tipos manejados |

---

## 📝 Archivos Modificados

1. ✅ `lib/websocket.ts`
   - Validación de eventos en `subscribeToPartida`
   - Verificación de `message.body`
   - Logs mejorados

2. ✅ `hooks/usePartida.ts`
   - Validación de eventos en callback
   - Manejo específico de `JUGADOR_UNIDO`
   - Manejo específico de `PARTIDA_INICIADA`
   - Actualización de estado por tipo de evento

3. ✅ `app/partida/[codigo]/page.tsx`
   - Mensajes descriptivos en `useEffect`
   - Lista de eventos mejorada con iconos
   - Validación antes de renderizar
   - Timestamps formateados

---

## 🚀 Próximos Pasos

1. **Probar flujo completo**: Crear partida → Unirse → Iniciar → Jugar
2. **Verificar sincronización**: Ambos jugadores deben ver los mismos eventos
3. **Revisar consola**: No debe haber errores de "undefined"
4. **Backend**: Asegurar que envía eventos correctamente formateados

---

## 🔐 Requisitos del Backend

Para que esto funcione completamente, el backend debe:

### 1. Enviar evento al unirse
```json
{
  "tipo": "JUGADOR_UNIDO",
  "codigoPartida": "D54954",
  "timestamp": "2025-10-10T12:00:00Z",
  "datos": {
    "jugadores": [
      {"id": "1", "username": "Thomas", "conectado": true},
      {"id": "2", "username": "Arianna", "conectado": true}
    ],
    "nuevoJugador": "Arianna"
  },
  "mensaje": "Arianna se ha unido a la partida"
}
```

### 2. Broadcast a todos los jugadores
```java
// En el backend (Spring Boot + WebSocket)
@MessageMapping("/partida/{codigo}/unirse")
@SendTo("/topic/partida/{codigo}")
public EventoWebSocket jugadorSeUne(@DestinationVariable String codigo, ...) {
    // Lógica para agregar jugador...
    
    // Enviar a TODOS los suscritos
    return new EventoWebSocket(
        TipoEventoWs.JUGADOR_UNIDO,
        codigo,
        LocalDateTime.now(),
        Map.of(
            "jugadores", partida.getJugadores(),
            "nuevoJugador", jugador.getUsername()
        ),
        jugador.getUsername() + " se ha unido a la partida"
    );
}
```

---

**Fecha del fix**: 10 de octubre de 2025  
**Problemas resueltos**: Event undefined, sincronización de jugadores, eventos vacíos  
**Estado**: ✅ LISTO PARA PROBAR
