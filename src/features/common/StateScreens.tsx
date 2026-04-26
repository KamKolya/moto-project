type BasicScreenProps = {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

function BasicScreen({title, description, action}: BasicScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800/80 bg-[#050913]/92 p-8 text-center shadow-[0_28px_80px_rgba(0,0,0,0.6)]">
        <h2 className="brand-font text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{description}</p>
        {action && (
          <button type="button" onClick={action.onClick} className="btn-primary mt-6 px-5 py-2.5 text-sm">
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

export function SessionCheckScreen() {
  return <BasicScreen title="Перевірка Сесії" description="Валідуємо токен доступу..." />;
}

export function LoadingScreen() {
  return <BasicScreen title="Завантаження Даних" description="Отримуємо дані з бази даних..." />;
}

export function DataErrorScreen({message, onRetry}: {message: string; onRetry: () => void}) {
  return (
    <BasicScreen
      title="Не Вдалося Завантажити Дані"
      description={message}
      action={{label: 'Спробувати Ще Раз', onClick: onRetry}}
    />
  );
}
