import {useCallback, useMemo, useState} from 'react';
import type {ShowToast, ToastMessage} from '../components/toast.types';

const TOAST_DURATION_MS = 3500;

export function useToasts(): {
  toasts: ToastMessage[];
  showToast: ShowToast;
  removeToast: (id: number) => void;
} {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback<ShowToast>((type, message) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);

    setToasts((prev) => [...prev, {id, type, message}]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  return useMemo(
    () => ({
      toasts,
      showToast,
      removeToast,
    }),
    [removeToast, showToast, toasts],
  );
}
