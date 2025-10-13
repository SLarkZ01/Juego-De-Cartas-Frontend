 'use client';
import { Button } from '@/components/ui/button';

type Props = {
  codigo: string;
  estado: string;
  visualConectado: boolean;
  onSalir: () => void;
};

export default function LobbyHeader({ codigo, estado, visualConectado, onSalir }: Props) {
  return (
    <div className="max-w-7xl mx-auto mb-6">
      <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-orange-500">Partida: {codigo}</h1>
            <p className="text-gray-400">Estado: <span className="text-white font-semibold">{estado}</span></p>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${visualConectado ? 'bg-green-900/30 border border-green-500' : 'bg-red-900/30 border border-red-500'}`}>
              <div className={`w-3 h-3 rounded-full ${visualConectado ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              <span className="text-sm text-white">{visualConectado ? 'Conectado' : 'Desconectado'}</span>
            </div>
            <Button onClick={onSalir} variant="outline">Salir</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
