export type ToastType = 'success' | 'error' | 'info';

export type ToastMessage = {
  id: number;
  type: ToastType;
  message: string;
};

export type ShowToast = (type: ToastType, message: string) => void;
