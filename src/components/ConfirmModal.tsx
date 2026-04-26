type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Підтвердити',
  cancelLabel = 'Скасувати',
  isProcessing = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#070c16] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.6)]">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="mt-2 text-sm text-slate-300">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={isProcessing} className="btn-ghost px-4 py-2 text-sm">
            {cancelLabel}
          </button>
          <button type="button" onClick={() => void onConfirm()} disabled={isProcessing} className="btn-primary px-4 py-2 text-sm">
            {isProcessing ? 'Виконується...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
