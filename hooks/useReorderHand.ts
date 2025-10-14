import { useState, useCallback, useRef } from 'react';
import { guardarOrdenMano } from '@/services/partida.service';

export type UseReorderProps = {
  partidaCodigo: string;
  initialHand: string[];
  onPartidaResponse?: (resp: any) => void;
};

export function useReorderHand({ partidaCodigo, initialHand, onPartidaResponse }: UseReorderProps) {
  const [hand, setHand] = useState<string[]>(initialHand);
  const [saving, setSaving] = useState(false);
  const prevRef = useRef<string[] | null>(null);

  // Optimistic reorder: aplica el nuevo orden localmente y guarda el anterior para rollback
  const applyLocalReorder = useCallback((newOrder: string[]) => {
    prevRef.current = hand.slice();
    setHand(newOrder);
  }, [hand]);

  // Confirmar (enviar al backend). Retorna la promesa de la llamada.
  const confirmReorder = useCallback(async (newOrder: string[]) => {
    setSaving(true);
    try {
      const resp = await guardarOrdenMano(partidaCodigo, newOrder);
      if (onPartidaResponse) onPartidaResponse(resp);
      prevRef.current = null;
      return resp;
    } catch (err: any) {
      // Rollback
      if (prevRef.current) setHand(prevRef.current);
      prevRef.current = null;
      throw err;
    } finally {
      setSaving(false);
    }
  }, [partidaCodigo, onPartidaResponse]);

  const rollback = useCallback(() => {
    if (prevRef.current) {
      setHand(prevRef.current);
      prevRef.current = null;
    }
  }, []);

  return { hand, setHand, applyLocalReorder, confirmReorder, rollback, saving };
}
