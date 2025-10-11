'use client';

import PlayerItem from './PlayerItem';

type Jugador = {
  id: string;
  nombre: string;
  numeroCartas?: number;
  conectado?: boolean;
  isMe?: boolean;
};

type Props = {
  jugadores: Jugador[];
  partidaTurno?: string;
};

export default function PlayersList({ jugadores, partidaTurno }: Props) {
  return (
    <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-4">
      <h2 className="text-xl font-bold text-orange-500 mb-4">Jugadores {jugadores.length > 0 && `(${jugadores.length})`}</h2>

      <div className="space-y-3">
        {jugadores.map((jugador) => (
          <PlayerItem key={jugador.id} jugador={jugador} esTuTurno={partidaTurno === jugador.id} />
        ))}
      </div>
    </div>
  );
}
