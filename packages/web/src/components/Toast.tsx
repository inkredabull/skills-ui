import { useEffect } from 'react';

export interface ToastData {
  message: string;
  tone?: 'info' | 'error';
  action?: { label: string; run: () => void };
}

export function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  // Errors stay a little longer; actions (Undo) get the longest window.
  useEffect(() => {
    const ms = toast.action ? 10_000 : toast.tone === 'error' ? 7_000 : 4_000;
    const t = setTimeout(onDismiss, ms);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  return (
    <div
      role="status"
      className={`fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-lg px-4 py-3 text-sm shadow-lg ${
        toast.tone === 'error'
          ? 'bg-red-600 text-white'
          : 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
      }`}
    >
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.run();
            onDismiss();
          }}
          className="font-semibold underline"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
