import { useMemo } from 'react';

type Player = {
  id: string;
  orden?: number;
  numeroCartas?: number; // optional: may be named count in some payloads
};

type UseTurnHandlerProps = {
  players: Player[] | undefined | null;
  turnoActual?: string | null;
  cartasEnMesaCount: number;
  atributoSeleccionado?: string | null;
  myPlayerId?: string | null;
};

export function useTurnHandler({ players, turnoActual, cartasEnMesaCount, atributoSeleccionado, myPlayerId }: UseTurnHandlerProps) {
  const expectedPlayerId = useMemo(() => {
    if (!players || players.length === 0 || !turnoActual) return null;

    // Normalize counts: prefer numeroCartas, fallback to numeroCartas property
    const activos = players
      .filter((p) => (typeof p.numeroCartas === 'number' ? p.numeroCartas > 0 : true))
      .slice()
      .sort((a, b) => (Number(a.orden ?? 0) - Number(b.orden ?? 0)));

    if (activos.length === 0) return null;

    let start = activos.findIndex((p) => String(p.id) === String(turnoActual));
    // If turnoActual isn't found among active players (e.g., has 0 cards),
    // fallback to the first active player to avoid blocking the UI.
    if (start === -1) {
      start = 0;
    }
    const ordered = Array.from({ length: activos.length }, (_, i) => activos[(start + i) % activos.length]);
    return ordered[cartasEnMesaCount % ordered.length]?.id || null;
  }, [players, turnoActual, cartasEnMesaCount]);

  const canDropToMesa = useMemo(() => {
    if (!myPlayerId || !expectedPlayerId) return false;
    if (String(myPlayerId) !== String(expectedPlayerId)) return false;
    if (cartasEnMesaCount === 0 && !atributoSeleccionado) return false; // first play needs atributo
    return true;
  }, [myPlayerId, expectedPlayerId, cartasEnMesaCount, atributoSeleccionado]);

  return { expectedPlayerId, canDropToMesa } as const;
}

export default useTurnHandler;
