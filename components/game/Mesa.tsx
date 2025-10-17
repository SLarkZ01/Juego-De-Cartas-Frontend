"use client";

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useGameData } from '@/hooks/useGameData';
import { cartaService } from '@/services/partida.service';
import type { Carta } from '@/types/api';
import CartaComponent from '@/components/game/CartaComponent';
import { useEffect } from 'react';

type Props = {
  className?: string;
  jugadores?: Array<any>;
  selectedAtributo?: string | null;
  selectedCartaCodigo?: string | null;
  extraCartas?: any[];
};

export default function Mesa({ className = '', jugadores = [], selectedAtributo = null, selectedCartaCodigo = null, extraCartas = [] }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'mesa' });
  // Intentar cargar imagen desde public; si no existe, usar un fallback de color
  const bgStyle: React.CSSProperties = { backgroundImage: "url('/mesa.webp')" };

  const { cartasEnMesa, rondaResultado, resolviendo: resolviendoFlag, completeResolution, cartasDB, setCartasDB } = useGameData();
  const [resolviendo, setResolviendo] = React.useState(false);

  // Simple collect animation: clones cards and animate to target avatar element (by selector)
  const animateCollect = async (ganadorSelector: string) => {
    if (!document) return;
    try {
      setResolviendo(true);
      const clones: HTMLElement[] = [];
      const rects: DOMRect[] = [];

      (cartasEnMesa as Array<any>).forEach((c: any, idx: number) => {
        const el = document.querySelector(`[data-mesa-card-index="${idx}"]`) as HTMLElement | null;
        if (!el) return;
        const r = el.getBoundingClientRect();
        rects.push(r);
        const clone = el.cloneNode(true) as HTMLElement;
        clone.style.position = 'fixed';
        clone.style.left = `${r.left}px`;
        clone.style.top = `${r.top}px`;
        clone.style.width = `${r.width}px`;
        clone.style.height = `${r.height}px`;
        clone.style.transition = 'transform 600ms ease-in-out, opacity 600ms ease-in-out';
        clone.style.zIndex = '9999';
        document.body.appendChild(clone);
        clones.push(clone);
      });

      const targetEl = document.querySelector(ganadorSelector) as HTMLElement | null;
      const targetRect = targetEl ? targetEl.getBoundingClientRect() : null;

      // Trigger animations
      await new Promise((resolve) => setTimeout(resolve, 50));

      clones.forEach((clone) => {
        if (!targetRect) {
          clone.style.opacity = '0';
          return;
        }
        const cx = targetRect.left + targetRect.width / 2;
        const cy = targetRect.top + targetRect.height / 2;
        const cr = clone.getBoundingClientRect();
        const tx = cx - (cr.left + cr.width / 2);
        const ty = cy - (cr.top + cr.height / 2);
        clone.style.transform = `translate(${tx}px, ${ty}px) scale(0.4)`;
        clone.style.opacity = '0.6';
      });

      // wait for animation
      await new Promise((resolve) => setTimeout(resolve, 650));

      // cleanup
      clones.forEach((c) => { try { c.remove(); } catch {} });
    } finally {
      setResolviendo(false);
    }
  };

  // Small renderer for a carta in the mesa
  const CartaMesa = ({ carta, idx }: { carta: any; idx: number }) => {
    const code = String(carta.codigoCarta ?? carta.codigo ?? carta.datos?.codigo ?? '');
    // prefer card from cartasDB to render full info
    const fullCarta: Carta = cartasDB && cartasDB[code] ? (cartasDB[code] as Carta) : {
      codigo: code,
      nombre: carta.nombreCarta || carta.nombre || '',
      imagenUrl: carta.imagen || carta.imagenUrl || undefined,
      atributos: {},
    } as Carta;

    // try to resolve jugador name from provided players prop (if any)
    let jugadorNombre: string | undefined = undefined;
    try {
      if (Array.isArray(jugadores) && jugadores.length > 0) {
        const found = jugadores.find((p: any) => String(p.id) === String(carta.jugadorId) || String((p as any).userId ?? '') === String(carta.jugadorId));
        if (found) jugadorNombre = found.nombre || found.name || found.username;
      }
    } catch { /* ignore */ }

    // fallback: maybe the carta object already contains jugadorNombre
    const badgeName = jugadorNombre ?? (carta.jugadorNombre ?? carta.jugadorName ?? carta.jugadorId);

    return (
      <div data-mesa-card-index={idx} className="absolute" style={{ left: `${10 + idx * 14}%`, top: `${20 + (idx % 2) * 6}%`, width: '120px' }}>
          {/* player name badge (will be filled by parent via data attributes if available) */}
          <div className="absolute -top-4 left-0 right-0 flex justify-center pointer-events-none z-40">
            <div className="bg-black/60 text-white text-[11px] font-medium px-2 py-0.5 rounded">{String(badgeName ?? '')}</div>
          </div>
          <div className="relative">
            <CartaComponent carta={fullCarta} mostrarAtributos={true} nameVariant="mesa" selectedAtributo={selectedAtributo} selectedCartaCodigo={selectedCartaCodigo} />
            {/* If this carta on mesa has atributoSeleccionado or valorAtributo, show a visible badge for all players */}
            {(carta.atributoSeleccionado || carta.valorAtributo) && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 bg-white/95 text-black text-[11px] font-semibold px-2 py-0.5 rounded-full shadow-lg z-50 pointer-events-none">
                {carta.atributoSeleccionado ? `${String(carta.atributoSeleccionado).toUpperCase()} ${carta.valorAtributo ? `: ${carta.valorAtributo}` : ''}` : `${carta.valorAtributo ?? ''}`}
              </div>
            )}
          </div>
        </div>
    );
  };

  // Ensure full card data is available in cartasDB for cards played on mesa
  useEffect(() => {
    if (!cartasEnMesa || cartasEnMesa.length === 0) return;
    (async () => {
      try {
        const missingCodes: string[] = [];
        (cartasEnMesa as any[]).forEach((c) => {
          const code = String(c.codigoCarta ?? c.codigo ?? c.datos?.codigo ?? '');
          if (code && (!cartasDB || !cartasDB[code])) missingCodes.push(code);
        });

        // fetch missing codes sequentially (could be parallel but keep gentle)
        for (const code of missingCodes) {
          try {
            const full = await cartaService.obtenerCartaPorCodigo(code);
            if (full && full.codigo) setCartasDB((prev) => ({ ...(prev || {}), [full.codigo]: full }));
          } catch (e) {
            // ignore individual card fetch errors
            console.warn('[Mesa] failed to fetch carta detail', code, e);
          }
        }
      } catch (e) {
        console.warn('[Mesa] error ensuring cartasDB', e);
      }
    })();
  }, [cartasEnMesa, cartasDB, setCartasDB]);

  // When rondaResultado appears in useGameData, perform animation and then call completeResolution
  useEffect(() => {
    let mounted = true;
    if (!rondaResultado) return;

    (async () => {
      try {
        const ganadorId = rondaResultado && (rondaResultado as any).ganadorId ? String((rondaResultado as any).ganadorId) : undefined;
        if (!ganadorId) {
          // finalize without animation
          if (completeResolution) await completeResolution();
          return;
        }

        setResolviendo(true);
        await animateCollect(`[data-player-id="${ganadorId}"]`);
        if (completeResolution) await completeResolution();
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setResolviendo(false);
      }
    })();

    return () => { mounted = false; };
  }, [rondaResultado, completeResolution]);

  return (
    <div ref={setNodeRef} className={`relative rounded-lg overflow-hidden ${className}`}>
      <div className={`w-full h-72 bg-center bg-cover border border-gray-800 rounded-lg ${isOver ? 'ring-4 ring-orange-400/40' : ''}`} style={bgStyle}>
        <div className="w-full h-full relative">
          {(!cartasEnMesa || cartasEnMesa.length === 0) && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-gray-200/80">Aquí se desplegarán las cartas jugadas</div>
            </div>
          )}

          {(() => {
            const combined: any[] = [];
            const seen = new Set<string>();
            const pushIfNew = (c: any) => {
              const id = `${String(c.jugadorId ?? c.jugadorId)}_${String(c.codigoCarta ?? c.codigo ?? c.datos?.codigo ?? '')}`;
              if (!seen.has(id)) { seen.add(id); combined.push(c); }
            };
            (cartasEnMesa || []).forEach((c: any) => pushIfNew(c));
            (extraCartas || []).forEach((c: any) => pushIfNew(c));
            return combined.map((c, idx) => <CartaMesa key={`${String(c.jugadorId)}_${idx}`} carta={c} idx={idx} />);
          })()}
        </div>
      </div>
    </div>
  );
}
