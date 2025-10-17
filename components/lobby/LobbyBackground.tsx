"use client";

import React from 'react';

type Props = {
  gifs?: string[];
  intervalMs?: number;
  className?: string;
};

export default function LobbyBackground({ gifs = [], intervalMs = 8000, className = '' }: Props) {
  const [index, setIndex] = React.useState(0);
  const list = gifs && gifs.length ? gifs : ['/images/fondo.webp'];

  React.useEffect(() => {
    if (!list || list.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % list.length), intervalMs);
    return () => clearInterval(t);
  }, [list.length, intervalMs]);

  return (
    <div className={`absolute inset-0 -z-10 overflow-hidden ${className}`} aria-hidden>
      {list.map((src, i) => (
        <img
          key={src + i}
          src={src}
          alt="fondo"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-900 ease-[cubic-bezier(.2,.9,.2,1)] ${i === index ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}
          style={{ willChange: 'opacity, transform' }}
        />
      ))}
      <div className="absolute inset-0 bg-black/40" />
    </div>
  );
}
