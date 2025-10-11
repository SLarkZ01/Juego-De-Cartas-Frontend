'use client';

import { useEffect, useState } from 'react';

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

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-full px-4 sm:px-0">
      <div className="mx-auto max-w-md bg-white/5 border border-orange-500/40 text-white px-4 py-3 rounded-lg shadow-lg">
        <div className="text-sm text-center">{message}</div>
      </div>
    </div>
  );
}
