'use client';

type Props = {
  title?: string;
  children?: React.ReactNode;
  onClose?: () => void;
  open: boolean;
};

export default function Modal({ title, children, onClose, open }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 sm:px-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-black/90 border border-orange-500/40 rounded-lg max-w-lg w-full sm:w-11/12 md:w-3/4 p-4 sm:p-6 z-10">
        {title && <h3 className="text-lg sm:text-xl text-orange-400 font-bold mb-3">{title}</h3>}
        <div className="text-gray-200">{children}</div>
      </div>
    </div>
  );
}
