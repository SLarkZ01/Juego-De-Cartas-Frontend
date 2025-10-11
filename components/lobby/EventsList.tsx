'use client';

type Evento = {
  tipo?: string;
  mensaje?: string;
  timestamp?: string | number;
};

type Props = {
  eventos: Evento[];
};

export default function EventsList({ eventos }: Props) {
  if (!eventos || eventos.length === 0) return null;

  return (
    <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-orange-500/30 p-4">
      <h3 className="text-lg font-bold text-orange-500 mb-3">Eventos Recientes</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {eventos.slice(0, 10).map((evento, idx) => {
          if (!evento || !evento.tipo) return null;

          let mensaje = evento.mensaje || '';
          let icono = '📢';

          switch (evento.tipo) {
            case 'JUGADOR_UNIDO':
              icono = '👋';
              mensaje = mensaje || 'Nuevo jugador se unió';
              break;
            case 'JUGADOR_DESCONECTADO':
              icono = '🚪';
              mensaje = mensaje || 'Jugador desconectado';
              break;
            case 'PARTIDA_INICIADA':
              icono = '🎮';
              mensaje = mensaje || 'Partida iniciada';
              break;
            case 'TURNO_CAMBIADO':
              icono = '🔄';
              mensaje = mensaje || 'Cambió el turno';
              break;
            case 'ATRIBUTO_SELECCIONADO':
              icono = '🎯';
              mensaje = mensaje || 'Atributo seleccionado';
              break;
            case 'CARTA_JUGADA':
              icono = '🃏';
              mensaje = mensaje || 'Carta jugada';
              break;
            case 'RONDA_COMPLETADA':
              icono = '🏆';
              mensaje = mensaje || 'Ronda completada';
              break;
            case 'PARTIDA_FINALIZADA':
              icono = '🎉';
              mensaje = mensaje || 'Partida finalizada';
              break;
            case 'TRANSFORMACION_ACTIVADA':
              icono = '⚡';
              mensaje = mensaje || 'Transformación activada';
              break;
            case 'ERROR':
              icono = '❌';
              break;
            default:
              icono = '📢';
          }

          return (
            <div key={idx} className="p-3 bg-gray-900/50 rounded border border-gray-700 hover:border-orange-500/50 transition-colors">
              <div className="flex items-start gap-2">
                <span className="text-xl">{icono}</span>
                <div className="flex-1">
                  <span className="text-orange-400 font-semibold text-sm block">{evento.tipo?.replace(/_/g, ' ')}</span>
                  {mensaje && (<span className="text-gray-300 text-sm block mt-1">{mensaje}</span>)}
                  {evento.timestamp && (<span className="text-gray-500 text-xs block mt-1">{new Date(evento.timestamp).toLocaleTimeString('es-ES')}</span>)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
