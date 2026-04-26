import {type FormEvent, useMemo, useState} from 'react';
import {Pencil, Trash2} from 'lucide-react';
import type {Customer, CustomerSegment} from '../../api';
import {ConfirmModal} from '../../components/ConfirmModal';
import {CUSTOMER_SEGMENT_VALUES} from '../../../shared/domain';

type Props = {
  customers: Customer[];
  onCreate: (payload: {name: string; phone: string; email: string; segment: CustomerSegment}) => Promise<void>;
  onUpdate: (id: string, payload: {name: string; phone: string; email: string; segment: CustomerSegment}) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  segment: 'Стандарт' as CustomerSegment,
};

function getStatusClass(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes('актив')) {
    return 'status-badge status-ok';
  }
  if (lower.includes('нов')) {
    return 'status-badge status-warn';
  }
  return 'status-badge status-warn';
}

export function CustomersSection({customers, onCreate, onUpdate, onDelete}: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Customer | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) {
      return customers;
    }

      return customers.filter(
        (customer) =>
          customer.id.toLowerCase().includes(lower) ||
          customer.name.toLowerCase().includes(lower) ||
          customer.phone.toLowerCase().includes(lower) ||
          customer.email.toLowerCase().includes(lower) ||
          customer.segment.toLowerCase().includes(lower),
      );
  }, [customers, query]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {...form, segment: form.segment as CustomerSegment};
    if (editingCustomerId) {
      await onUpdate(editingCustomerId, payload);
    } else {
      await onCreate(payload);
    }
    setForm(EMPTY_FORM);
    setEditingCustomerId(null);
  };

  const startEdit = (customer: Customer) => {
    setEditingCustomerId(customer.id);
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      segment: customer.segment,
    });
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingCustomerId(null);
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
            <h2 className="text-2xl font-extrabold text-white">Клієнтська база</h2>
            <p className="mt-1 text-sm text-slate-400">Додавайте нових клієнтів, керуйте сегментами, а статус формується автоматично за історією замовлень.</p>
          </div>
          {editingCustomerId && (
            <button type="button" onClick={resetForm} className="btn-ghost px-3 py-2 text-xs">
              Скасувати редагування
            </button>
          )}
        </div>

        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={submit}>
          <label>
            <span className="field-label">Ім'я / Компанія</span>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({...prev, name: event.target.value}))}
              className="input-shell"
              required
            />
          </label>
          <label>
            <span className="field-label">Телефон</span>
            <input
              value={form.phone}
              onChange={(event) => setForm((prev) => ({...prev, phone: event.target.value}))}
              className="input-shell"
              required
            />
          </label>
          <label>
            <span className="field-label">Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({...prev, email: event.target.value}))}
              className="input-shell"
              required
            />
          </label>
          <label>
            <span className="field-label">Сегмент</span>
            <div className="flex gap-2">
              <select
                value={form.segment}
                onChange={(event) => setForm((prev) => ({...prev, segment: event.target.value as CustomerSegment}))}
                className="select-shell w-full"
              >
                {CUSTOMER_SEGMENT_VALUES.map((segment) => (
                  <option key={segment} value={segment}>
                    {segment}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary px-4 py-2 text-sm">
                {editingCustomerId ? 'Зберегти' : 'Додати'}
              </button>
            </div>
          </label>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#060b15]">
        <div className="border-b border-slate-800/80 p-3 md:p-4">
          <label className="block">
            <span className="field-label">Пошук клієнта</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ім'я, телефон або email"
              className="input-shell md:max-w-sm"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th>ID</th>
                <th>Ім'я</th>
                <th>Телефон</th>
                <th>Email</th>
                <th>Сегмент</th>
                <th>Замовлень</th>
                <th>Витрачено</th>
                <th>Статус</th>
                <th className="text-right">Дії</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.id}</td>
                  <td className="font-semibold text-slate-100">{customer.name}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.email}</td>
                  <td>{customer.segment}</td>
                  <td>{customer.totalOrders}</td>
                  <td className="font-semibold text-slate-100">{customer.totalSpent}</td>
                  <td>
                    <span className={getStatusClass(customer.status)}>{customer.status}</span>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(customer)}
                        className="btn-ghost inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Редагувати
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteCandidate(customer)}
                        className="btn-ghost inline-flex items-center gap-1 px-3 py-1.5 text-xs text-rose-200"
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
                  <td colSpan={9} className="py-10 text-center text-sm text-slate-500">
                    Клієнтів за цим запитом не знайдено.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteCandidate)}
        title="Підтвердження видалення"
        message={deleteCandidate ? `Видалити клієнта "${deleteCandidate.name}" (${deleteCandidate.id})?` : ''}
        confirmLabel="Так, видалити"
        cancelLabel="Ні"
        isProcessing={isDeleteSubmitting}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
