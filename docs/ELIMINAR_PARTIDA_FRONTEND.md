# Eliminación de Partida cuando el creador sale (Frontend)

Objetivo: cuando el jugador que creó la partida (orden = 1) se sale antes de que la partida inicie (estado `EN_ESPERA`), el backend eliminará la partida por completo y notificará en tiempo real a todos los clientes suscritos para que cierren el lobby.

## Comportamiento backend

- Si el creador (jugador con `orden == 1`) sale y la partida está en `EN_ESPERA`:
  - El backend publicará un `PartidaResponse` en `/topic/partida/{codigo}` con el campo `eliminada: true` y `jugadores == null`.
  - Después el backend eliminará la partida de la base de datos.

- Para los demás jugadores que salen, el backend publica el `PartidaResponse` normal (lista actualizada de jugadores).

## Qué debe hacer el frontend

- Mantener suscripción STOMP a `/topic/partida/{codigo}`.
- Al recibir un mensaje del topic, parsear `PartidaResponse` y comprobar `eliminada`:
  - Si `eliminada === true`: cerrar automáticamente el lobby y navegar al listado de partidas o mostrar un modal indicando que la partida fue cancelada por el creador.
  - Si `eliminada === false` o no está presente: actualizar la lista de jugadores con `partidaResp.jugadores`.

## Ejemplo de suscripción y manejo

```javascript
client.subscribe(`/topic/partida/${codigo}`, (msg) => {
  const partidaResp = JSON.parse(msg.body);

  if (partidaResp.eliminada) {
    // Cerrar lobby: por ejemplo, redirigir o mostrar modal
    showModal('La partida fue cancelada por el creador.');
    router.push('/partidas'); // o la ruta que muestre el listado
    return;
  }

  // Actualizar lista de jugadores normalmente
  setJugadores(partidaResp.jugadores || []);
});
```

## Qué hacer cuando el usuario principal pulsa "Salir"

- Llamar al endpoint POST `/api/partidas/{codigo}/salir`.
- Si la petición devuelve 200, la eliminación o actualización será notificada por WebSocket; no hacer un fetch adicional.

## Pruebas recomendadas

1. Abrir dos navegadores A y B, ambos suscritos a `/topic/partida/{codigo}`.
2. A es el creador (orden 1). A pulsa "Salir".
3. B debe recibir un `PartidaResponse` con `eliminada: true` y cerrar el lobby inmediatamente.
4. Verificar que la partida ya no existe en el endpoint GET `/api/partidas/{codigo}` (debe devolver 400/404).

## Notas

- Autenticación: el endpoint identifica el jugador por el usuario autenticado. Asegúrate de enviar cookies o token correctamente.
- Compatibilidad: se añadió el campo `eliminada` a `PartidaResponse`. Si hay clientes que no esperan este campo, simplemente lo ignorarán (valor por defecto `false`).

Si quieres, actualizo `docs/GUIA_INTEGRACION_NEXTJS.md` directamente con el snippet y un ejemplo completo (hook React) para Next.js.
