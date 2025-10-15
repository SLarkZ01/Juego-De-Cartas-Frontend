'use client';

type Jugador = {
  id: string;
  nombre: string;
  numeroCartas?: number;
  conectado?: boolean;
  isMe?: boolean;
};

type Props = {
  jugador: Jugador;
  esTuTurno?: boolean;
};

export default function PlayerItem({ jugador, esTuTurno }: Props) {
  const eresT = jugador.isMe;

  return (
    <div
      data-player-id={jugador.id}
      className={`p-3 rounded-lg border-2 transition-all ${
        esTuTurno
          ? 'bg-orange-600/20 border-orange-500 animate-pulse'
          : eresT
          ? 'bg-blue-600/20 border-blue-500'
          : 'bg-gray-800/50 border-gray-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
            esTuTurno ? 'bg-orange-500' : eresT ? 'bg-blue-500' : 'bg-gray-600'
          }`}>
            {jugador.nombre.charAt(0).toUpperCase()}
          </div>

          <div>
            <p className={`font-semibold ${
              eresT ? 'text-blue-400' : 'text-white'
            }`}>
              {jugador.nombre} {eresT && '(Tú)'}
            </p>
            <p className="text-sm text-gray-400">
              {jugador.numeroCartas || 0} {jugador.numeroCartas === 1 ? 'carta' : 'cartas'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${
              jugador.conectado ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-xs text-gray-400">
              {jugador.conectado ? 'Conectado' : 'Desconectado'}
            </span>
          </div>

          {esTuTurno && (
            <span className="text-orange-400 text-sm font-bold">▶ Su turno</span>
          )}
        </div>
      </div>
    </div>
  );
}
