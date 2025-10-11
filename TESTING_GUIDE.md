# 🎮 Guía Rápida - Probar el Juego

## ✅ Checklist Pre-inicio

Antes de iniciar el frontend, verifica que:

1. **Backend está corriendo**
   ```bash
   # En el directorio del backend
   mvn spring-boot:run
   ```
   Debe estar en: `http://localhost:8080`

2. **Base de datos MongoDB está activa**
   - MongoDB debe estar corriendo
   - Verifica conexión en el backend

3. **CORS configurado en el backend**
   - Debe permitir origen: `http://localhost:3000`
   - Debe permitir headers: `Authorization`, `Content-Type`
   - Debe permitir credentials: `true`

## 🚀 Iniciar Frontend

```bash
# 1. Instalar dependencias (solo primera vez)
npm install

# 2. Configurar variables de entorno
# Copia .env.local.example a .env.local (o créalo con este contenido):
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local
echo "NEXT_PUBLIC_WS_URL=http://localhost:8080/ws" >> .env.local

# 3. Iniciar servidor de desarrollo
npm run dev
```

El frontend estará disponible en: `http://localhost:3000`

## 🎯 Prueba del Flujo Completo

### Paso 1: Registro de Usuarios (2 usuarios mínimo)

**Usuario 1:**
1. Abre `http://localhost:3000` en el navegador
2. Click en "Registrarse"
3. Completa el formulario:
   - Username: `goku`
   - Email: `goku@dbz.com`
   - Password: `123456`
4. Click "Crear Cuenta"
5. Serás redirigido a `/jugar`

**Usuario 2 (en navegador incógnito o diferente):**
1. Abre `http://localhost:3000` en incógnito
2. Registra segundo usuario:
   - Username: `vegeta`
   - Email: `vegeta@dbz.com`
   - Password: `123456`

### Paso 2: Crear Partida (Usuario 1)

1. En la página `/jugar`
2. Click en "Crear Partida"
3. Se creará una partida y verás un código (ej: `ABC123`)
4. **Copia este código** - lo necesitarás para que otros se unan

### Paso 3: Unirse a Partida (Usuario 2)

1. En el navegador del Usuario 2
2. Click en "Unirse a Partida"
3. Ingresa el código de la partida (ej: `ABC123`)
4. Click en "Unirse a Partida"

### Paso 4: Iniciar Juego

1. **Usuario 1** (creador de la partida)
2. Cuando veas que hay 2 jugadores, click en "🎮 Iniciar Partida"
3. El juego comenzará

### Paso 5: Jugar

**En tu turno (indicado con borde naranja pulsante):**

1. **Seleccionar Atributo**: Elige un atributo de tu carta
   - Ejemplo: `poder`, `velocidad`, `ki`, etc.

2. **Jugar Carta**: Click en "🎴 Jugar Carta"
   - Tu carta se compara con las demás
   - El jugador con el valor más alto gana la ronda

3. **(Opcional) Transformaciones**: 
   - Si tu carta tiene transformaciones
   - Click en "⚡ [Nombre Transformación]"
   - Aumenta los atributos de tu carta

**Fuera de tu turno:**
- Espera y observa las jugadas de otros
- Ve los eventos en tiempo real

## 🔍 Verificaciones durante el juego

### Frontend (Navegador)

**Consola del navegador (F12 > Console):**
```
✅ Conectado al WebSocket
📡 Suscrito a /topic/partida/ABC123
📨 Evento recibido: JUGADOR_UNIDO
```

**Indicadores visuales:**
- 🟢 "Conectado" en verde = WebSocket activo
- Borde naranja pulsante = Es tu turno
- Eventos aparecen en tiempo real en la sección "Eventos Recientes"

### Backend (Terminal)

**Deberías ver logs como:**
```
INFO: Usuario registrado: goku
INFO: Partida creada: ABC123
INFO: Jugador goku unido a partida ABC123
INFO: WebSocket conectado: /topic/partida/ABC123
INFO: Partida ABC123 iniciada
```

## 🐛 Solución de Problemas Comunes

### Error: "Network Error" al registrarse

**Problema:** Backend no está corriendo o CORS mal configurado

**Solución:**
1. Verifica backend: `curl http://localhost:8080/actuator/health`
2. Verifica CORS en `CorsConfig.java`:
   ```java
   @Override
   public void addCorsMappings(CorsRegistry registry) {
       registry.addMapping("/**")
           .allowedOrigins("http://localhost:3000")
           .allowedMethods("*")
           .allowCredentials(true);
   }
   ```

### Error: WebSocket no conecta

**Síntomas:** Ves 🔴 "Desconectado" rojo

**Solución:**
1. Verifica configuración WebSocket en backend
2. Verifica que `NEXT_PUBLIC_WS_URL` está correcto
3. Mira consola del navegador para errores específicos

### Error: "Token expirado" o redirección a login

**Problema:** El JWT expiró

**Solución:**
1. Cierra sesión (si puedes)
2. Vuelve a iniciar sesión
3. Si persiste, limpia localStorage: `localStorage.clear()` en consola

### No puedo ver la carta

**Problema:** Cartas no están sincronizadas

**Solución:**
1. Backend debe tener cartas en la BD
2. Llama al endpoint de sincronización:
   ```bash
   curl -X POST http://localhost:8080/api/cartas/sincronizar \
        -H "Authorization: Bearer TU_TOKEN"
   ```

### Los eventos no aparecen en tiempo real

**Problema:** WebSocket desconectado o no enviando eventos

**Solución:**
1. Verifica que WebSocket está conectado (🟢)
2. Mira consola del navegador: `📨 Evento recibido`
3. Verifica que backend está publicando eventos:
   ```java
   messagingTemplate.convertAndSend("/topic/partida/" + codigo, evento);
   ```

## 📊 Pruebas Avanzadas

### Probar con múltiples jugadores (3-7)

1. Abre múltiples navegadores/pestañas incógnito
2. Registra diferentes usuarios
3. Únelos todos a la misma partida
4. Observa la gestión de turnos

### Probar desconexión/reconexión

1. Durante una partida, cierra una pestaña
2. Deberías ver en los demás: "Jugador desconectado"
3. Vuelve a abrir y reconecta
4. El WebSocket debería reconectarse automáticamente

### Probar transformaciones

1. Busca cartas con transformaciones (Dragon Ball)
2. Durante tu turno, activa una transformación
3. Los atributos deberían multiplicarse
4. Observa el indicador "⚡ [Transformación] Activa"

## 📝 Notas Importantes

1. **Mínimo 2 jugadores** para iniciar una partida
2. **Máximo 7 jugadores** por partida
3. Solo el **creador** puede iniciar la partida
4. Las **transformaciones son opcionales**
5. El juego termina cuando un jugador se queda sin cartas

## 🎉 ¡Listo para Jugar!

Si todo funciona correctamente, deberías poder:
- ✅ Registrarte e iniciar sesión
- ✅ Crear y unirte a partidas
- ✅ Ver actualizaciones en tiempo real
- ✅ Jugar turnos alternados
- ✅ Usar transformaciones
- ✅ Ver eventos del juego

---

**¿Problemas?** Revisa:
1. Consola del navegador (F12)
2. Terminal del backend
3. Logs de MongoDB
4. Variables de entorno (.env.local)

**¿Funciona todo?** 🎊
¡Hora de buscar bugs y mejoras! Documenta cualquier comportamiento extraño.
