import type {FormEvent} from 'react';

type LoginScreenProps = {
  email: string;
  password: string;
  error: string | null;
  isSubmitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function LoginScreen({
  email,
  password,
  error,
  isSubmitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-[520px] rounded-3xl border border-slate-800/80 bg-[#050913]/92 p-8 shadow-[0_28px_80px_rgba(0,0,0,0.6)]">
        <div className="mb-6 text-center">
          <h1 className="brand-font text-3xl font-semibold text-white">Курсова</h1>
          <p className="mt-2 text-sm text-slate-400">Система обліку та продажу мотоциклів</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="field-label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              className="input-shell"
              required
            />
          </label>

          <label className="block">
            <span className="field-label">Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              className="input-shell"
              required
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" disabled={isSubmitting} className="btn-primary mt-2 w-full py-3 text-sm">
            {isSubmitting ? 'Вхід...' : 'Увійти'}
          </button>
        </form>
      </div>
    </div>
  );
}
