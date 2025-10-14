## Frontend — Renderizado de la mesa y animaciones (Next.js / React)

Este documento muestra cómo renderizar las cartas en la mesa, cómo reaccionar a los eventos `CartaJugadaEvent` y `RondaResueltaEvent`, y sugiere una UX para la animación de recolección.

1) Estado a mantener en el cliente
- `cartasEnMesa`: array de objetos { jugadorId, cartaCodigo, nombre, imagen, valor }.
- `mostrandoResolucion`: boolean (evitar nuevos drops mientras se anima la resolución).

2) Manejo de eventos importantes
- `CartaJugadaEvent`: push a `cartasEnMesa` (si la carta ya existe, actualizarla). Renderizar la carta en el sector de la mesa en la posición asociada al jugador.
- `RondaResueltaEvent`: mostrar overlay con `ganadorId` y `resultados` (lista con valores por jugador). Animar que las cartas se muevan desde la mesa al avatar del ganador.

3) Ejemplo de componente Mesa (simplificado)

```tsx
function Mesa({ partidaCodigo }) {
  const [cartasEnMesa, setCartasEnMesa] = useState([]);
  const [resolviendo, setResolviendo] = useState(false);

  useEffect(() => {
    stomp.subscribe(`/topic/partida/${partidaCodigo}`, (msg) => {
      const ev = JSON.parse(msg.body);
      if (ev.type === 'CARTA_JUGADA') {
        setCartasEnMesa(prev => [...prev, { jugadorId: ev.jugadorId, codigo: ev.codigoCarta, nombre: ev.nombreCarta, imagen: ev.imagenCarta, valor: ev.valor }]);
      } else if (ev.type === 'RONDA_RESUELTA') {
        setResolviendo(true);
        // animar recolección
        animateCollect(ev.ganadorId, cartasEnMesa).then(() => {
          setCartasEnMesa([]);
          setResolviendo(false);
        });
      }
    });
  }, [partidaCodigo, cartasEnMesa]);

  return (
    <div className="mesa">
      {cartasEnMesa.map((c, idx) => (
        <CartaMesa key={idx} carta={c} />
      ))}
      {resolviendo && <div className="overlay">Resolviendo ronda...</div>}
    </div>
  )
}
```

4) Animación de recolección (sugerencia)
- Para animar la recolección de cartas al ganador:
  - Captura posiciones absolutas de cada carta en la mesa y la posición del avatar del ganador.
  - Crear clones absolutos de las cartas y animarlos (CSS transform/transition) desde su posición actual hasta la del ganador.
  - Al finalizar animación, actualizar estado local: limpiar `cartasEnMesa` y confiar en `CardCountEvent` para actualizar números de cartas.

5) Manejo de empates
- Si `RondaResueltaEvent.empate === true`, mostrar que las cartas fueron acumuladas y mantener el turno actual (según payload del evento). La mesa se limpiará pero las cartas se marcarán como acumuladas en el backend; el frontend debe confiar en `CardCountEvent` para saber si las cartas vuelven a manos o se acumulan.

6) Recomendaciones UX
- Mostrar marcador visible del `atributoSeleccionado` mientras la ronda está activa.
- Bloquear acciones de los jugadores mientras `resolviendo === true`.
- Confirmar jugadas cuando llegue `CartaJugadaEvent` (no retirar la carta local hasta confirmar).
