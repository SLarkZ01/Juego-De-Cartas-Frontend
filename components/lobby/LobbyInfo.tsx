'use client';

import { Button } from '@/components/ui/button';

type Props = {
  partidaEstado?: string;
  jugadoresLobbyCount: number;
  puedesIniciar: boolean;
  onIniciar?: () => void;
  disabled?: boolean;
  starting?: boolean;
};

export default function LobbyInfo({ partidaEstado, jugadoresLobbyCount, puedesIniciar, onIniciar, disabled, starting }: Props) {
  return (
    <div className="mt-6 bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-4">
      <h3 className="text-lg font-bold text-orange-500 mb-3">Información</h3>

      {partidaEstado === 'ESPERANDO' && (
        <div className="space-y-3">
          <p className="text-gray-300 text-sm">Esperando jugadores... ({jugadoresLobbyCount}/7)</p>
          {puedesIniciar && jugadoresLobbyCount >= 2 && (
            <Button onClick={onIniciar} className="w-full bg-green-600 hover:bg-green-700" disabled={!!disabled || !!starting}>
              {starting ? 'Iniciando...' : '🎮 Iniciar Partida'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
