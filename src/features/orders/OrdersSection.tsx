import {type FormEvent, useEffect, useMemo, useState} from 'react';
import {FileText, PlusCircle, Trash2} from 'lucide-react';
import type {Customer, InventoryItem, Order, OrderStatus} from '../../api';
import {ConfirmModal} from '../../components/ConfirmModal';
import {getAllowedOrderTransitions} from '../../../shared/domain';

type Props = {
  orders: Order[];
  inventory: InventoryItem[];
  customers: Customer[];
  onCreate: (
    payload:
      | {
          customerMode: 'existing';
          inventoryId: string;
          customerId: string;
          quantity: number;
        }
      | {
          customerMode: 'new';
          inventoryId: string;
          customerName: string;
          phone: string;
          email: string;
          quantity: number;
        },
  ) => Promise<void>;
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function getStatusClass(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes('викон')) {
    return 'status-badge status-ok';
  }
  if (lower.includes('очіку') || lower.includes('оброб')) {
    return 'status-badge status-warn';
  }
  if (lower.includes('скас')) {
    return 'status-badge status-danger';
  }
  return 'status-badge status-warn';
}

export function OrdersSection({orders, inventory, customers, onCreate, onUpdateStatus, onDelete}: Props) {
  const availableInventory = useMemo(() => inventory.filter((item) => item.stock > 0), [inventory]);
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>(customers.length > 0 ? 'existing' : 'new');
  const [newOrder, setNewOrder] = useState({
    inventoryId: inventory.find((item) => item.stock > 0)?.id ?? '',
    customerId: customers[0]?.id ?? '',
    customerName: '',
    phone: '',
    email: '',
    quantity: 1,
  });
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Order | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  useEffect(() => {
    if (availableInventory.length === 0) {
      setNewOrder((prev) => ({...prev, inventoryId: ''}));
      return;
    }

    setNewOrder((prev) =>
      availableInventory.some((item) => item.id === prev.inventoryId)
        ? prev
        : {...prev, inventoryId: availableInventory[0].id},
    );
  }, [availableInventory]);

  useEffect(() => {
    if (customers.length === 0) {
      setCustomerMode('new');
      setNewOrder((prev) => ({...prev, customerId: ''}));
      return;
    }

    setNewOrder((prev) =>
      customers.some((customer) => customer.id === prev.customerId)
        ? prev
        : {...prev, customerId: customers[0].id},
    );
  }, [customers]);

  const selectedExistingCustomer = useMemo(
    () => customers.find((customer) => customer.id === newOrder.customerId) ?? null,
    [customers, newOrder.customerId],
  );
  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) ?? null, [orders, selectedOrderId]);
  const selectedCustomer = useMemo(
    () => (selectedOrder ? customers.find((customer) => customer.id === selectedOrder.customerId) ?? null : null),
    [customers, selectedOrder],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (customerMode === 'existing') {
      await onCreate({
        customerMode: 'existing',
        inventoryId: newOrder.inventoryId,
        customerId: newOrder.customerId,
        quantity: Number(newOrder.quantity) || 1,
      });
    } else {
      await onCreate({
        customerMode: 'new',
        inventoryId: newOrder.inventoryId,
        customerName: newOrder.customerName,
        phone: newOrder.phone,
        email: newOrder.email,
        quantity: Number(newOrder.quantity) || 1,
      });
    }

    setNewOrder({
      inventoryId: availableInventory[0]?.id ?? '',
      customerId: customers[0]?.id ?? '',
      customerName: '',
      phone: '',
      email: '',
      quantity: 1,
    });
    setCustomerMode(customers.length > 0 ? 'existing' : 'new');
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Відділ продажів</p>
            <h2 className="text-2xl font-extrabold text-white">Оформлення замовлення</h2>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCustomerMode('existing')}
            disabled={customers.length === 0}
            className={`rounded-xl px-3 py-2 text-sm transition ${
              customerMode === 'existing'
                ? 'bg-red-500/16 text-red-300'
                : 'border border-slate-700/70 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Існуючий клієнт
          </button>
          <button
            type="button"
            onClick={() => setCustomerMode('new')}
            className={`rounded-xl px-3 py-2 text-sm transition ${
              customerMode === 'new'
                ? 'bg-red-500/16 text-red-300'
                : 'border border-slate-700/70 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            Новий клієнт
          </button>
        </div>

        <form className="grid gap-3 md:grid-cols-4" onSubmit={submit}>
          <label>
            <span className="field-label">Мотоцикл</span>
            <select
              value={newOrder.inventoryId}
              onChange={(event) => setNewOrder((prev) => ({...prev, inventoryId: event.target.value}))}
              className="select-shell"
              required
            >
              <option value="" disabled>
                Оберіть товар
              </option>
              {availableInventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} - {item.name} (доступно: {item.stock}, резерв: {item.reservedStock})
                </option>
              ))}
            </select>
          </label>

          {customerMode === 'existing' ? (
            <>
              <label>
                <span className="field-label">Клієнт</span>
                <select
                  value={newOrder.customerId}
                  onChange={(event) => setNewOrder((prev) => ({...prev, customerId: event.target.value}))}
                  className="select-shell"
                  required
                >
                  <option value="" disabled>
                    Оберіть клієнта
                  </option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.id} - {customer.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 px-3 py-2 text-sm text-slate-300">
                <p className="field-label">Контакти</p>
                <p className="mt-1 text-slate-100">{selectedExistingCustomer?.phone ?? 'Немає телефону'}</p>
                <p className="text-xs text-slate-500">{selectedExistingCustomer?.email ?? 'Немає email'}</p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 px-3 py-2 text-sm text-slate-300">
                <p className="field-label">Сегмент і статус</p>
                <p className="mt-1 text-slate-100">
                  {selectedExistingCustomer?.segment ?? 'Стандарт'} • {selectedExistingCustomer?.status ?? 'Новий'}
                </p>
              </div>
            </>
          ) : (
            <>
              <label>
                <span className="field-label">Клієнт</span>
                <input
                  value={newOrder.customerName}
                  onChange={(event) => setNewOrder((prev) => ({...prev, customerName: event.target.value}))}
                  className="input-shell"
                  placeholder="Ім'я клієнта"
                  required
                />
              </label>

              <label>
                <span className="field-label">Телефон</span>
                <input
                  value={newOrder.phone}
                  onChange={(event) => setNewOrder((prev) => ({...prev, phone: event.target.value}))}
                  className="input-shell"
                  placeholder="+38..."
                  required
                />
              </label>

              <label>
                <span className="field-label">Email</span>
                <input
                  type="email"
                  value={newOrder.email}
                  onChange={(event) => setNewOrder((prev) => ({...prev, email: event.target.value}))}
                  className="input-shell"
                  placeholder="client@example.com"
                  required
                />
              </label>
            </>
          )}

          <label>
            <span className="field-label">Кількість</span>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={newOrder.quantity}
                onChange={(event) => setNewOrder((prev) => ({...prev, quantity: Number(event.target.value)}))}
                className="input-shell w-full"
                required
              />
              <button type="submit" className="btn-primary inline-flex items-center gap-1 px-3 text-sm" disabled={!newOrder.inventoryId}>
                <PlusCircle className="h-4 w-4" />
                Створити
              </button>
            </div>
          </label>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#060b15]">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th>ID</th>
                <th>Клієнт</th>
                <th>Телефон</th>
                <th>Дата</th>
                <th>Позиція</th>
                <th>Сума</th>
                <th>Статус</th>
                <th className="text-right">Дії</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const allowedStatuses = [order.status, ...getAllowedOrderTransitions(order.status)];
                const canChangeStatus = allowedStatuses.length > 1;

                return (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td className="font-semibold text-slate-100">{order.customer}</td>
                    <td>{order.phone}</td>
                    <td>{order.date}</td>
                    <td>{order.items}</td>
                    <td className="font-semibold text-slate-100">{order.total}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={getStatusClass(order.status)}>{order.status}</span>
                        <select
                          value={order.status}
                          onChange={(event) => void onUpdateStatus(order.id, event.target.value as OrderStatus)}
                          className="select-shell max-w-[180px] py-1 text-xs"
                          disabled={!canChangeStatus}
                        >
                          {allowedStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedOrderId(order.id)}
                          className="btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-xs"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Деталі
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteCandidate(order)}
                          disabled={order.status === 'Виконано'}
                          title={order.status === 'Виконано' ? 'Завершені замовлення видаляти не можна' : undefined}
                          className="btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-rose-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Видалити
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                    Замовлень поки немає.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800/80 bg-[#070c16] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Клієнт</p>
            <h4 className="mt-2 text-lg font-bold text-white">{selectedCustomer?.name ?? selectedOrder.customer}</h4>
            <p className="mt-2 text-sm text-slate-300">Телефон: {selectedCustomer?.phone ?? selectedOrder.phone}</p>
            <p className="text-sm text-slate-300">Email: {selectedCustomer?.email ?? '-'}</p>
            <p className="text-sm text-slate-300">Сегмент: {selectedCustomer?.segment ?? 'Стандарт'}</p>
            <p className="text-sm text-slate-300">Статус клієнта: {selectedCustomer?.status ?? 'Новий'}</p>
            <p className="text-sm text-slate-300">ID клієнта: {selectedOrder.customerId}</p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#070c16] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Замовлення</p>
            <h4 className="mt-2 text-lg font-bold text-white">{selectedOrder.id}</h4>
            <p className="mt-2 text-sm text-slate-300">Дата: {selectedOrder.date}</p>
            <p className="text-sm text-slate-300">Статус: {selectedOrder.status}</p>
            <p className="text-sm text-slate-300">Позиція: {selectedOrder.items}</p>
            <p className="text-sm text-slate-100">Сума: {selectedOrder.total}</p>

            <button type="button" onClick={() => setSelectedOrderId(null)} className="btn-primary mt-4 px-4 py-2 text-xs">
              Закрити
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteCandidate)}
        title="Підтвердження видалення"
        message={deleteCandidate ? `Видалити замовлення ${deleteCandidate.id}?` : ''}
        confirmLabel="Так, видалити"
        cancelLabel="Ні"
        isProcessing={isDeleteSubmitting}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
