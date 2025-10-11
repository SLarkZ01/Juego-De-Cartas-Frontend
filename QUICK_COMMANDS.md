# 🚀 Comandos Rápidos

## Inicio Rápido (Windows PowerShell)

```powershell
# 1. Instalar dependencias (solo primera vez)
npm install

# 2. Crear archivo de variables de entorno
@"
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=http://localhost:8080/ws
NODE_ENV=development
"@ | Out-File -FilePath .env.local -Encoding UTF8

# 3. Iniciar desarrollo
npm run dev
```

## Comandos de Desarrollo

```powershell
# Desarrollo con turbopack (más rápido)
npm run dev

# Build para producción
npm run build

# Iniciar servidor de producción
npm run start

# Linter
npm run lint

# Limpiar caché y node_modules
Remove-Item -Recurse -Force node_modules, .next
npm install
```

## Verificar Conexión Backend

```powershell
# Verificar backend está activo
curl http://localhost:8080/actuator/health

# Si no existe actuator, prueba:
curl http://localhost:8080/api/cartas

# Verificar WebSocket (en navegador console)
# Abre http://localhost:3000 y en la consola:
new WebSocket('ws://localhost:8080/ws').onopen = () => console.log('✅ WS OK')
```

## Troubleshooting Rápido

```powershell
# Limpiar localStorage (en navegador console)
localStorage.clear()
console.log('✅ Storage limpio')

# Ver token actual (en navegador console)
console.log('Token:', localStorage.getItem('token'))
console.log('User:', localStorage.getItem('user'))

# Verificar errores en backend
# En terminal del backend, busca:
# - "CORS" errors
# - "401" unauthorized
# - "WebSocket" errors
```

## Testing Rápido con cURL

```powershell
# Registrar usuario
curl -X POST http://localhost:8080/auth/register `
  -H "Content-Type: application/json" `
  -d '{\"username\":\"testuser\",\"email\":\"test@test.com\",\"password\":\"123456\"}'

# Login
$response = curl -X POST http://localhost:8080/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"username\":\"testuser\",\"password\":\"123456\"}' | ConvertFrom-Json

$token = $response.token
Write-Host "Token: $token"

# Crear partida
curl -X POST http://localhost:8080/api/partidas/crear `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json"
```

## Git Útiles

```powershell
# Ver cambios
git status
git diff

# Commit de todos los cambios
git add .
git commit -m "feat: integración completa backend con autenticación JWT"

# Push
git push origin main
```

## Atajos Útiles

```powershell
# Abrir proyecto en VS Code
code .

# Abrir navegador en la app
start http://localhost:3000

# Ver logs de Next.js en tiempo real
npm run dev 2>&1 | Tee-Object -FilePath logs.txt

# Matar proceso en puerto 3000 (si está ocupado)
$process = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
if ($process) { Stop-Process -Id $process -Force }
```

## Scripts Personalizados (Opcional)

Añade a `package.json`:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build --turbopack",
    "start": "next start",
    "lint": "eslint",
    "clean": "rm -rf .next node_modules",
    "reset": "npm run clean && npm install",
    "test:backend": "curl http://localhost:8080/actuator/health"
  }
}
```

---

**💡 Tip:** Mantén este archivo abierto mientras desarrollas para referencia rápida.
