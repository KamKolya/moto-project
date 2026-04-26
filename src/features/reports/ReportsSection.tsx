import type {ReportsOverview} from '../../api';

type Props = {
  report: ReportsOverview | null;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number): string {
  return `${Math.round(value)}%`;
}

export function ReportsSection({report}: Props) {
  if (!report) {
    return (
      <section className="space-y-4">
        <article className="rounded-2xl border border-slate-800/80 bg-[#070c16] p-6 text-sm text-slate-400">
          Дані звітів тимчасово недоступні.
        </article>
      </section>
    );
  }

  const totalOrders = report.summary.totalOrders;
  const completedRate = totalOrders > 0 ? (report.summary.completedOrders / totalOrders) * 100 : 0;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="dashboard-panel p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Замовлення</p>
          <p className="mt-2 text-2xl font-extrabold text-white">{totalOrders}</p>
          <p className="mt-1 text-xs text-slate-400">За весь час</p>
        </article>

        <article className="dashboard-panel p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Виконано</p>
          <p className="mt-2 text-2xl font-extrabold text-white">{report.summary.completedOrders}</p>
          <p className="mt-1 text-xs text-slate-400">Конверсія: {percent(completedRate)}</p>
        </article>

        <article className="dashboard-panel p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Середній чек</p>
          <p className="mt-2 text-2xl font-extrabold text-white">{formatMoney(report.summary.averageOrder)}</p>
          <p className="mt-1 text-xs text-slate-400">Оцінка по замовленнях</p>
        </article>

        <article className="dashboard-panel p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Товари на ризику</p>
          <p className="mt-2 text-2xl font-extrabold text-white">{report.summary.lowStockCount}</p>
          <p className="mt-1 text-xs text-slate-400">Залишок 3 або менше</p>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-800/80 bg-[#070c16] p-4">
          <h3 className="text-lg font-bold text-white">Топ моделей за продажами</h3>
          <p className="mt-1 text-xs text-slate-400">По кількості проданих одиниць</p>

          <div className="mt-4 overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Модель</th>
                  <th>Продано</th>
                  <th>Оборот</th>
                </tr>
              </thead>
              <tbody>
                {report.topModels.length > 0 ? (
                  report.topModels.map((model) => (
                    <tr key={model.id}>
                      <td>{model.id}</td>
                      <td className="font-semibold text-slate-100">{model.name}</td>
                      <td>{model.soldUnits}</td>
                      <td className="font-semibold text-slate-100">{formatMoney(model.revenue)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-slate-500">
                      Даних поки недостатньо.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-800/80 bg-[#070c16] p-4">
          <h3 className="text-lg font-bold text-white">Статуси замовлень</h3>
          <p className="mt-1 text-xs text-slate-400">Розподіл по процесу продажів</p>

          <div className="mt-4 space-y-3">
            {report.statusStats.length > 0 ? (
              report.statusStats.map((item) => {
                const width = totalOrders > 0 ? Math.max(8, (item.count / totalOrders) * 100) : 8;
                return (
                  <div key={item.status}>
                    <div className="mb-1 flex items-center justify-between text-sm text-slate-300">
                      <span>{item.status}</span>
                      <span>{item.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800">
                      <div className="h-2 rounded-full bg-gradient-to-r from-red-600 to-red-400" style={{width: `${width}%`}} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">Немає замовлень для аналітики.</p>
            )}
          </div>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-800/80 bg-[#070c16] p-4">
          <h3 className="text-lg font-bold text-white">Топ клієнтів</h3>
          <p className="mt-1 text-xs text-slate-400">За загальною сумою покупок</p>

          <div className="mt-4 overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Клієнт</th>
                  <th>Замовлень</th>
                  <th>Сума</th>
                </tr>
              </thead>
              <tbody>
                {report.topCustomers.length > 0 ? (
                  report.topCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.id}</td>
                      <td className="font-semibold text-slate-100">{customer.name}</td>
                      <td>{customer.totalOrders}</td>
                      <td className="font-semibold text-slate-100">{formatMoney(customer.totalSpent)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-slate-500">
                      Даних по клієнтах немає.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-800/80 bg-[#070c16] p-4">
          <h3 className="text-lg font-bold text-white">Товари з малим залишком</h3>
          <p className="mt-1 text-xs text-slate-400">Потребують поповнення складу</p>

          <div className="mt-4 space-y-2">
            {report.lowStockItems.length > 0 ? (
              report.lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/30 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.id} • {item.category}
                    </p>
                  </div>
                  <span className={`status-badge ${item.stock > 0 ? 'status-warn' : 'status-danger'}`}>{item.stock} шт.</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Критичних залишків немає.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
