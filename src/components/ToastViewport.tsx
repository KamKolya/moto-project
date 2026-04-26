import type {ToastMessage} from './toast.types';

type Props = {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
};

const styleMap: Record<ToastMessage['type'], string> = {
  success: 'border-emerald-500/35 bg-emerald-950/45 text-emerald-100',
  error: 'border-red-500/40 bg-red-950/45 text-red-100',
  info: 'border-sky-500/35 bg-sky-950/45 text-sky-100',
};

export function ToastViewport({toasts, onDismiss}: Props) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-[999] flex w-[min(440px,92vw)] flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => onDismiss(toast.id)}
          className={`w-full rounded-xl border px-4 py-3 text-left text-sm shadow-[0_18px_45px_rgba(0,0,0,0.4)] backdrop-blur transition hover:opacity-90 ${styleMap[toast.type]}`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
