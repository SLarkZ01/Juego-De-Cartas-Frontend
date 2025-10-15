"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  message: string;
  open: boolean;
  duration?: number;
  onClose?: () => void;
};

export default function Toast({ message, open, duration = 4000, onClose }: Props) {
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    setVisible(open);
    if (open) {
      const t = setTimeout(() => {
        setVisible(false);
        onClose?.();
      }, duration);
      return () => clearTimeout(t);
    }
  }, [open, duration, onClose]);

  if (!visible) return null;

  const node = (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[9999] w-full px-4 sm:px-0 pointer-events-none" aria-live="polite">
      <div className="mx-auto max-w-2xl pointer-events-auto bg-black/90 border border-orange-500/70 text-white px-5 py-3 rounded-lg shadow-2xl backdrop-blur-sm">
        <div className="text-base sm:text-lg text-center font-semibold leading-tight">{message}</div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(node, document.body);
  }

  return node;
}
