import {type ChangeEvent, type FormEvent, useEffect, useRef, useState} from 'react';
import type {Profile} from '../../api';

type Props = {
  profile: Profile;
  onSave: (payload: Partial<Profile>) => Promise<void>;
};

export function ProfileSection({profile, onSave}: Props) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [role, setRole] = useState(profile.role);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
    setRole(profile.role);
    setAvatar(profile.avatar);
  }, [profile]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave({name, email, role, avatar});
  };

  const onAvatarPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setAvatarError('Файл завеликий. Максимум 3MB.');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Не вдалося прочитати файл'));
        reader.readAsDataURL(file);
      });

      setAvatar(dataUrl);
      setAvatarError(null);
    } catch {
      setAvatarError('Не вдалося завантажити фото.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-slate-800/80 bg-[#070c16] p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Поточний Користувач</p>
        <img src={avatar} alt="Аватар" className="mt-4 h-28 w-28 rounded-2xl border border-slate-700/80 object-cover" />
        <h3 className="mt-4 text-xl font-bold text-white">{name}</h3>
        <p className="text-sm text-slate-400">{role}</p>
        <p className="mt-3 rounded-xl border border-slate-800/80 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">{email}</p>
      </aside>

      <div className="rounded-2xl border border-slate-800/80 bg-[#070c16] p-5">
        <h2 className="text-2xl font-extrabold text-white">Редагування Профілю</h2>
        <p className="mt-1 text-sm text-slate-400">Оновіть дані адміністратора системи. Email із цього профілю використовується під час входу.</p>

        <form className="mt-5 grid gap-3 md:grid-cols-2" onSubmit={submit}>
          <label>
            <span className="field-label">Ім'я</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="input-shell" required />
          </label>
          <label>
            <span className="field-label">Роль</span>
            <input value={role} onChange={(event) => setRole(event.target.value)} className="input-shell" required />
          </label>
          <label>
            <span className="field-label">Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-shell" required />
          </label>
          <div>
            <span className="field-label">Аватар</span>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/30 p-3">
              <img src={avatar} alt="Аватар" className="h-12 w-12 rounded-lg border border-slate-700 object-cover" />
              <input ref={fileInputRef} type="file" accept="image/*" onChange={onAvatarPick} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-ghost px-3 py-2 text-xs"
              >
                Обрати фото
              </button>
            </div>
            {avatarError && <p className="mt-2 text-xs text-red-400">{avatarError}</p>}
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button type="submit" className="btn-primary px-5 py-2.5 text-sm">
              Зберегти Профіль
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
