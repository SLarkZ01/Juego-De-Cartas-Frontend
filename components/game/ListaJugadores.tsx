'use client';

import type { JugadorPublic } from '@/types/api';

interface ListaJugadoresProps {
  jugadores: JugadorPublic[];
  jugadorActualId: string;
  turnoActualId?: string;
}

export default function ListaJugadores({ jugadores, jugadorActualId, turnoActualId }: ListaJugadoresProps) {
  // Log para diagnóstico
  if (process.env.NODE_ENV === 'development') {
    console.log('[ListaJugadores] Renderizando:', {
      jugadoresCount: jugadores?.length || 0,
      jugadorActualId,
      jugadores: jugadores?.map(j => ({ id: j.id, nombre: j.nombre, conectado: j.conectado })),
    });
  }

  return (
    <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-4">
      <h2 className="text-xl font-bold text-orange-500 mb-4">
        Jugadores {jugadores?.length > 0 && `(${jugadores.length})`}
      </h2>
      
      {(!jugadores || jugadores.length === 0) && (
        <div className="text-gray-400 text-center py-4">
          <p>No hay jugadores en la partida</p>
          <p className="text-xs mt-2">Esperando conexión...</p>
        </div>
      )}
      
      <div className="space-y-3">
        {jugadores?.map((jugador) => {
          const esTuTurno = jugador.id === turnoActualId;
          const eresT= jugador.id === jugadorActualId;
          
          return (
            <div
              key={jugador.id}
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
                  {/* Avatar */}
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
                      {jugador.numeroCartas} {jugador.numeroCartas === 1 ? 'carta' : 'cartas'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Estado de conexión */}
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${
                      jugador.conectado ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span className="text-xs text-gray-400">
                      {jugador.conectado ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>

                  {/* Indicador de turno */}
                  {esTuTurno && (
                    <span className="text-orange-400 text-sm font-bold">
                      ▶ Su turno
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        }) || []}
      </div>
    </div>
  );
}
