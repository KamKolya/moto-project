import {type ChangeEvent, type FormEvent, useMemo, useRef, useState} from 'react';
import {ImagePlus, Info, Pencil, Plus, Search, Trash2, X} from 'lucide-react';
import type {InventoryItem, Order} from '../../api';
import {ConfirmModal} from '../../components/ConfirmModal';
import {MOTORCYCLE_CATEGORIES, type MotorcycleCategory} from '../../../shared/domain';

type Props = {
  items: InventoryItem[];
  orders: Order[];
  onCreate: (payload: {
    name: string;
    category: MotorcycleCategory;
    year: string;
    engine: string;
    price: string;
    stock: number;
    image?: string;
  }) => Promise<boolean>;
  onUpdate: (
    id: string,
    payload: {
      name: string;
      category: MotorcycleCategory;
      year: string;
      engine: string;
      price: string;
      stock: number;
      image?: string;
    },
  ) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
};

type FormState = {
  name: string;
  category: MotorcycleCategory;
  year: string;
  engine: string;
  price: string;
  stock: number;
  image: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  category: 'Спорт',
  year: '',
  engine: '',
  price: '',
  stock: 0,
  image: '',
};

const FALLBACK_MOTO_IMAGE =
  'https://images.unsplash.com/photo-1609630875171-b1321377ee65?auto=format&fit=crop&q=80&w=900';

const MIN_YEAR = 1900;
const MAX_YEAR = new Date().getFullYear() + 1;

function isValidModelYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) {
    return false;
  }

  const year = Number(value);
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

function formatEditablePrice(priceCents: number): string {
  const majorUnits = priceCents / 100;
  if (Number.isInteger(majorUnits)) {
    return String(majorUnits);
  }

  return majorUnits.toFixed(2).replace(/\.?0+$/, '');
}

function getStatusClass(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes('наяв') || lower.includes('актив')) {
    return 'status-badge status-ok';
  }
  if (lower.includes('закінч') || lower.includes('очіку')) {
    return 'status-badge status-warn';
  }
  if (lower.includes('нема')) {
    return 'status-badge status-danger';
  }
  return 'status-badge status-warn';
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('uk-UA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не вдалося прочитати файл'));
    reader.readAsDataURL(file);
  });
}

export function InventorySection({items, orders, onCreate, onUpdate, onDelete}: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<InventoryItem | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<string>('');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [yearError, setYearError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const categories = useMemo(() => ['all', ...new Set(items.map((item) => item.category))], [items]);
  const statuses = useMemo(() => ['all', ...new Set(items.map((item) => item.status))], [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return items.filter((item) => {
      const matchesQuery =
        !q ||
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.engine.toLowerCase().includes(q);

      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [items, query, categoryFilter, statusFilter]);

  const selectedStats = useMemo(() => {
    if (!selectedItem) {
      return {ordersCount: 0, soldUnits: 0};
    }

    const related = orders.filter((order) => order.inventoryId === selectedItem.id);
    const soldUnits = related.reduce((sum, order) => sum + Math.max(1, Number(order.quantity) || 1), 0);
    return {ordersCount: related.length, soldUnits};
  }, [orders, selectedItem]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValidModelYear(form.year)) {
      setYearError(`Введіть коректний рік у форматі YYYY (${MIN_YEAR}-${MAX_YEAR}).`);
      return;
    }

    setYearError(null);
    const payload = {...form, stock: Number(form.stock) || 0, image: form.image.trim() || undefined};
    const isSaved = editingItemId ? await onUpdate(editingItemId, payload) : await onCreate(payload);
    if (!isSaved) {
      return;
    }

    setForm(EMPTY_FORM);
    setIsCreateOpen(false);
    setEditingItemId(null);
  };

  const handleYearChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value.replace(/\D/g, '').slice(0, 4);
    setYearError(nextValue.length === 4 && !isValidModelYear(nextValue) ? `Некоректний рік. Дозволено ${MIN_YEAR}-${MAX_YEAR}.` : null);
    setForm((prev) => ({...prev, year: nextValue}));
  };

  const openPhotoModal = () => {
    setPhotoError(null);
    setPhotoDraft(form.image || '');
    setIsPhotoModalOpen(true);
  };

  const closePhotoModal = () => {
    setIsPhotoModalOpen(false);
    setPhotoError(null);
  };

  const handleFilePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setPhotoError('Файл завеликий. Максимум 3MB.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPhotoDraft(dataUrl);
      setPhotoError(null);
    } catch {
      setPhotoError('Не вдалося завантажити фото.');
    } finally {
      event.target.value = '';
    }
  };

  const savePhoto = () => {
    setForm((prev) => ({...prev, image: photoDraft}));
    closePhotoModal();
  };

  const openCreatePanel = () => {
    setEditingItemId(null);
    setForm(EMPTY_FORM);
    setYearError(null);
    setIsCreateOpen((prev) => !prev || editingItemId !== null);
  };

  const startEdit = (item: InventoryItem) => {
    setEditingItemId(item.id);
    setYearError(null);
    setForm({
      name: item.name,
      category: item.category,
      year: item.year,
      engine: item.engine,
      price: formatEditablePrice(item.priceCents),
      stock: item.onHandStock,
      image: item.image,
    });
    setIsCreateOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) {
      return;
    }

    setIsDeleteSubmitting(true);
    try {
      await onDelete(deleteCandidate.id);
      setDeleteCandidate(null);
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-800/80 bg-[#070c16] p-3 md:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Панель управління</p>
            <h2 className="mt-1 text-2xl font-extrabold text-white">Управління складом</h2>
          </div>
          <button
            type="button"
            onClick={openCreatePanel}
            className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            <Plus className="h-4 w-4" />
            {isCreateOpen ? 'Закрити форму' : 'Додати'}
          </button>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <label className="md:col-span-2">
            <span className="field-label">Пошук</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Пошук моделі..."
                className="input-shell pl-9"
              />
            </span>
          </label>

          <label>
            <span className="field-label">Категорія</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="select-shell">
              <option value="all">Всі категорії</option>
              {categories
                .filter((value) => value !== 'all')
                .map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
            </select>
          </label>

          <label>
            <span className="field-label">Статус</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="select-shell">
              <option value="all">Всі статуси</option>
              {statuses
                .filter((value) => value !== 'all')
                .map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>

      {isCreateOpen && (
        <div className="rounded-2xl border border-slate-800/80 bg-[#070c16] p-3 md:p-4">
          <h3 className="text-base font-semibold text-white">
            {editingItemId ? `Редагування позиції ${editingItemId}` : 'Нова позиція складу'}
          </h3>
          <form className="mt-3 grid gap-3 md:grid-cols-3" onSubmit={submit}>
            <label>
              <span className="field-label">Назва</span>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({...prev, name: event.target.value}))}
                className="input-shell"
                required
              />
            </label>
            <label>
              <span className="field-label">Категорія</span>
              <select
                value={form.category}
                onChange={(event) => setForm((prev) => ({...prev, category: event.target.value as MotorcycleCategory}))}
                className="select-shell"
                required
              >
                {MOTORCYCLE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Рік</span>
              <input
                value={form.year}
                onChange={handleYearChange}
                inputMode="numeric"
                maxLength={4}
                placeholder="YYYY"
                pattern="[0-9]{4}"
                title={`Формат: YYYY. Рік ${MIN_YEAR}-${MAX_YEAR}`}
                aria-invalid={Boolean(yearError)}
                className="input-shell"
                required
              />
              {yearError && <p className="mt-1 text-xs text-red-400">{yearError}</p>}
            </label>
            <label>
              <span className="field-label">Двигун</span>
              <input
                value={form.engine}
                onChange={(event) => setForm((prev) => ({...prev, engine: event.target.value}))}
                className="input-shell"
                required
              />
            </label>
            <label>
              <span className="field-label">Ціна</span>
              <input
                value={form.price}
                onChange={(event) => setForm((prev) => ({...prev, price: event.target.value}))}
                className="input-shell"
                required
              />
            </label>
            <label>
              <span className="field-label">Всього на складі</span>
              <input
                type="number"
                min={0}
                value={form.stock}
                onChange={(event) => setForm((prev) => ({...prev, stock: Number(event.target.value)}))}
                className="input-shell"
                required
              />
              <p className="mt-1 text-xs text-slate-500">Доступний залишок система перерахує автоматично з урахуванням активних резервів.</p>
            </label>

            <div className="md:col-span-2 rounded-xl border border-slate-800/80 bg-slate-900/30 p-3">
              <p className="field-label">Фото мотоцикла</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {form.image ? (
                  <img src={form.image} alt="Попередній перегляд" className="h-16 w-16 rounded-lg border border-slate-700 object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-700 text-slate-500">
                    <ImagePlus className="h-5 w-5" />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={openPhotoModal} className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs">
                    <ImagePlus className="h-4 w-4" />
                    {form.image ? 'Змінити фото' : 'Додати фото'}
                  </button>
                  {form.image && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({...prev, image: ''}))}
                      className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs text-rose-200"
                    >
                      <X className="h-4 w-4" />
                      Прибрати
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full px-4 py-2.5 text-sm">
                {editingItemId ? 'Зберегти зміни' : 'Додати позицію'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#060b15]">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1020px]">
            <thead>
              <tr>
                <th>ID</th>
                <th>Модель</th>
                <th>Категорія</th>
                <th>Рік / Двигун</th>
                <th>Ціна</th>
                <th>Залишки</th>
                <th>Статус</th>
                <th className="text-right">Дії</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-12 w-12 rounded-md border border-slate-700/70 object-cover"
                        onError={(event) => {
                          const element = event.currentTarget;
                          if (element.src !== FALLBACK_MOTO_IMAGE) {
                            element.src = FALLBACK_MOTO_IMAGE;
                          }
                        }}
                      />
                      <div>
                        <p className="font-semibold text-white">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.id}</p>
                      </div>
                    </div>
                  </td>
                  <td>{item.category}</td>
                  <td>
                    {item.year} | {item.engine}
                  </td>
                  <td className="font-semibold text-slate-100">{item.price}</td>
                  <td>
                    <div className="text-sm text-slate-200">
                      <p>Доступно: {item.stock}</p>
                      <p className="text-xs text-slate-500">Резерв: {item.reservedStock} • Всього: {item.onHandStock}</p>
                    </div>
                  </td>
                  <td>
                    <span className={getStatusClass(item.status)}>{item.status}</span>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Редагувати
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-xs"
                      >
                        <Info className="h-3.5 w-3.5" />
                        Детальніше
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteCandidate(item)}
                        className="btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-rose-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Видалити
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                    За фільтрами нічого не знайдено.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-[#070c16] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Деталі мотоцикла</p>
                <h3 className="mt-1 text-xl font-bold text-white">{selectedItem.name}</h3>
                <p className="text-sm text-slate-400">{selectedItem.id}</p>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)} className="btn-ghost px-3 py-1.5 text-xs">
                Закрити
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
              <img
                src={selectedItem.image}
                alt={selectedItem.name}
                className="h-56 w-full rounded-xl border border-slate-700/80 object-cover"
                onError={(event) => {
                  const element = event.currentTarget;
                  if (element.src !== FALLBACK_MOTO_IMAGE) {
                    element.src = FALLBACK_MOTO_IMAGE;
                  }
                }}
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Категорія</p>
                  <p className="mt-1 text-sm text-white">{selectedItem.category}</p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Рік випуску</p>
                  <p className="mt-1 text-sm text-white">{selectedItem.year}</p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Двигун</p>
                  <p className="mt-1 text-sm text-white">{selectedItem.engine}</p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Ціна</p>
                  <p className="mt-1 text-sm text-white">{selectedItem.price}</p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Доступний залишок</p>
                  <p className="mt-1 text-sm text-white">{selectedItem.stock} шт.</p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Резерв / Всього</p>
                  <p className="mt-1 text-sm text-white">
                    {selectedItem.reservedStock} шт. / {selectedItem.onHandStock} шт.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Статус</p>
                  <p className="mt-1 text-sm text-white">{selectedItem.status}</p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-3 sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Дата додавання у асортимент</p>
                  <p className="mt-1 text-sm text-white">{formatDateTime(selectedItem.createdAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-3 sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Додаткова статистика</p>
                  <p className="mt-1 text-sm text-white">
                    Замовлень: {selectedStats.ordersCount} | Продано одиниць: {selectedStats.soldUnits}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPhotoModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#070c16] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
            <h3 className="text-lg font-bold text-white">Додати фото мотоцикла</h3>
            <p className="mt-1 text-sm text-slate-400">Оберіть зображення з вашого комп'ютера.</p>

            <div className="mt-4 space-y-3">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFilePick} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                <ImagePlus className="h-4 w-4" />
                Обрати фото
              </button>

              {photoError && <p className="text-sm text-red-400">{photoError}</p>}

              {photoDraft ? (
                <img src={photoDraft} alt="Попередній перегляд" className="h-56 w-full rounded-xl border border-slate-700 object-cover" />
              ) : (
                <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-700 text-slate-500">
                  Фото ще не вибрано
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closePhotoModal} className="btn-ghost px-4 py-2 text-sm">
                Скасувати
              </button>
              <button
                type="button"
                onClick={savePhoto}
                disabled={!photoDraft}
                className="btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Застосувати
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteCandidate)}
        title="Підтвердження видалення"
        message={
          deleteCandidate
            ? `Ви дійсно хочете видалити "${deleteCandidate.name}" (${deleteCandidate.id})?`
            : ''
        }
        confirmLabel="Так, видалити"
        cancelLabel="Ні"
        isProcessing={isDeleteSubmitting}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
