import {useEffect, useMemo, useState, type FormEvent} from 'react';
import {BarChart3, LogOut, Package, ShoppingCart, User, Users, type LucideIcon} from 'lucide-react';
import {
  api,
  getAuthToken,
  setAuthToken,
  type BootstrapPayload,
  type Customer,
  type CustomerSegment,
  type CustomerStatus,
  type InventoryItem,
  type MotorcycleCategory,
  type Order,
  type OrderStatus,
  type Profile,
  type ReportsOverview,
} from './api';
import {ToastViewport} from './components/ToastViewport';
import {LoginScreen} from './features/auth/LoginScreen';
import {DataErrorScreen, LoadingScreen, SessionCheckScreen} from './features/common/StateScreens';
import {CustomersSection} from './features/customers/CustomersSection';
import {InventorySection} from './features/inventory/InventorySection';
import {OrdersSection} from './features/orders/OrdersSection';
import {ProfileSection} from './features/profile/ProfileSection';
import {ReportsSection} from './features/reports/ReportsSection';
import {useToasts} from './hooks/useToasts';

const EMPTY_PROFILE: Profile = {
  name: 'Адміністратор',
  role: 'Адміністратор',
  email: 'admin@motosys.ua',
  avatar: 'https://i.pravatar.cc/150?img=11',
};

type TabKey = 'inventory' | 'orders' | 'customers' | 'reports' | 'profile';

type ApiError = Error & {status?: number};

type SidebarItem = {
  key: TabKey;
  label: string;
  description: string;
  icon: LucideIcon;
};

const SIDEBAR_ITEMS: SidebarItem[] = [
  {key: 'inventory', label: 'Склад', description: 'Залишки та моделі', icon: Package},
  {key: 'orders', label: 'Замовлення', description: 'Оформлення продажів', icon: ShoppingCart},
  {key: 'customers', label: 'Клієнти', description: 'База клієнтів', icon: Users},
  {key: 'reports', label: 'Звіти', description: 'Аналітика', icon: BarChart3},
  {key: 'profile', label: 'Профіль', description: 'Адміністратор', icon: User},
];

const HEADER_LINKS: Array<{label: string; tab: TabKey}> = [
  {label: 'Головна', tab: 'inventory'},
  {label: 'Каталог', tab: 'inventory'},
  {label: 'Замовлення', tab: 'orders'},
  {label: 'Клієнти', tab: 'customers'},
  {label: 'Звіти', tab: 'reports'},
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Невідома помилка';
}

function getStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }
  const status = (error as ApiError).status;
  return typeof status === 'number' ? status : undefined;
}

function parseMoney(value: string): number {
  const normalized = value.replace(/[^\d.-]/g, '');
  return Number(normalized) || 0;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('inventory');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [reportsOverview, setReportsOverview] = useState<ReportsOverview | null>(null);

  const [authEmail, setAuthEmail] = useState(EMPTY_PROFILE.email);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthEnabled, setIsAuthEnabled] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const {toasts, showToast, removeToast} = useToasts();

  const tabTitle = useMemo(() => {
    switch (activeTab) {
      case 'inventory':
        return 'Управління складом';
      case 'orders':
        return 'Замовлення';
      case 'customers':
        return 'Клієнти';
      case 'reports':
        return 'Звіти';
      case 'profile':
        return 'Профіль';
      default:
        return 'Курсова';
    }
  }, [activeTab]);

  const availableUnits = useMemo(
    () => reportsOverview?.summary.totalStockUnits ?? inventory.reduce((sum, item) => sum + Math.max(item.stock, 0), 0),
    [inventory, reportsOverview],
  );
  const inventoryModelsCount = useMemo(
    () => reportsOverview?.summary.totalInventoryItems ?? inventory.length,
    [inventory, reportsOverview],
  );
  const customersCount = useMemo(() => reportsOverview?.summary.totalCustomers ?? customers.length, [customers, reportsOverview]);
  const finishedOrders = useMemo(
    () => reportsOverview?.summary.completedOrders ?? orders.filter((order) => order.status === 'Виконано').length,
    [orders, reportsOverview],
  );
  const totalRevenue = useMemo(
    () =>
      reportsOverview?.summary.totalRevenue ??
      orders.filter((order) => order.status === 'Виконано').reduce((sum, order) => sum + parseMoney(order.total), 0),
    [orders, reportsOverview],
  );

  const logout = () => {
    setAuthToken(null);
    setIsAuthenticated(false);
    setAuthPassword('');
    setInventory([]);
    setOrders([]);
    setCustomers([]);
    setProfile(EMPTY_PROFILE);
    setReportsOverview(null);
    setDataError(null);
    setIsLoading(false);
  };

  const withApiGuard = (error: unknown): string => {
    if (getStatus(error) === 401) {
      logout();
      return 'Сесія завершилася. Увійдіть повторно.';
    }
    return getErrorMessage(error);
  };

  const loadData = async (showLoader = false) => {
    if (showLoader) {
      setIsLoading(true);
    }

    try {
      const [data, reports]: [BootstrapPayload, ReportsOverview] = await Promise.all([
        api.bootstrap(),
        api.reportsOverview(),
      ]);
      setInventory(data.inventory);
      setOrders(data.orders);
      setCustomers(data.customers);
      setProfile(data.profile);
      setAuthEmail(data.profile.email);
      setReportsOverview(reports);
      setDataError(null);
    } catch (error) {
      const message = withApiGuard(error);
      setDataError(message);
      showToast('error', message);
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      const token = getAuthToken();
      if (!token) {
        try {
          const me = await api.me();
          setIsAuthEnabled(me.authEnabled);
          if (!me.authEnabled) {
            setIsAuthenticated(true);
            await loadData(true);
          }
        } catch {
          setIsAuthEnabled(true);
        } finally {
          setIsAuthReady(true);
          setIsLoading(false);
        }
        return;
      }

      try {
        const me = await api.me();
        setIsAuthEnabled(me.authEnabled);
        setIsAuthenticated(true);
        await loadData(true);
      } catch {
        logout();
      } finally {
        setIsAuthReady(true);
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, []);

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setIsAuthSubmitting(true);

    try {
      const response = await api.login(authEmail.trim(), authPassword);
      setAuthToken(response.token);
      setIsAuthEnabled(true);
      setIsAuthenticated(true);
      setAuthPassword('');
      showToast('success', 'Авторизація успішна');
      await loadData(true);
    } catch (error) {
      setAuthToken(null);
      setIsAuthenticated(false);
      const message = getErrorMessage(error);
      setAuthError(message);
      showToast('error', message);
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleInventoryCreate = async (payload: {
    name: string;
    category: MotorcycleCategory;
    year: string;
    engine: string;
    price: string;
    stock: number;
    image?: string;
  }): Promise<boolean> => {
    try {
      await api.createInventoryItem(payload);
      await loadData();
      showToast('success', 'Товар додано');
      return true;
    } catch (error) {
      showToast('error', withApiGuard(error));
      return false;
    }
  };

  const handleInventoryUpdate = async (
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
  ): Promise<boolean> => {
    try {
      await api.updateInventoryItem(id, payload);
      await loadData();
      showToast('success', `Позицію ${id} оновлено`);
      return true;
    } catch (error) {
      showToast('error', withApiGuard(error));
      return false;
    }
  };

  const handleInventoryDelete = async (id: string) => {
    try {
      await api.deleteInventoryItem(id);
      await loadData();
      showToast('success', `Товар ${id} видалено`);
    } catch (error) {
      showToast('error', withApiGuard(error));
    }
  };

  const handleOrderCreate = async (payload: {
    inventoryId: string;
    quantity: number;
  } & (
    | {customerMode: 'existing'; customerId: string}
    | {customerMode: 'new'; customerName: string; phone: string; email: string}
  )) => {
    try {
      const order = await api.createOrder(payload);
      await loadData();
      showToast('success', `Створено замовлення ${order.id}`);
    } catch (error) {
      showToast('error', withApiGuard(error));
    }
  };

  const handleOrderStatus = async (id: string, status: OrderStatus) => {
    try {
      await api.updateOrderStatus(id, status);
      await loadData();
      showToast('info', `Статус ${id} змінено`);
    } catch (error) {
      showToast('error', withApiGuard(error));
    }
  };

  const handleOrderDelete = async (id: string) => {
    try {
      await api.deleteOrder(id);
      await loadData();
      showToast('success', `Замовлення ${id} видалено`);
    } catch (error) {
      showToast('error', withApiGuard(error));
    }
  };

  const handleCustomerCreate = async (payload: {name: string; phone: string; email: string; segment: CustomerSegment}) => {
    try {
      await api.createCustomer(payload);
      await loadData();
      showToast('success', 'Клієнта додано');
    } catch (error) {
      showToast('error', withApiGuard(error));
    }
  };

  const handleCustomerUpdate = async (
    id: string,
    payload: {name: string; phone: string; email: string; segment: CustomerSegment},
  ) => {
    try {
      await api.updateCustomer(id, payload);
      await loadData();
      showToast('success', `Клієнта ${id} оновлено`);
    } catch (error) {
      showToast('error', withApiGuard(error));
    }
  };

  const handleCustomerDelete = async (id: string) => {
    try {
      await api.deleteCustomer(id);
      await loadData();
      showToast('success', `Клієнта ${id} видалено`);
    } catch (error) {
      showToast('error', withApiGuard(error));
    }
  };

  const handleProfileSave = async (payload: Partial<Profile>) => {
    try {
      const updated = await api.updateProfile(payload);
      setProfile(updated);
      setAuthEmail(updated.email);
      showToast('success', 'Профіль збережено');
      if (payload.email && payload.email !== profile.email) {
        showToast('info', `Новий email для входу: ${updated.email}`);
      }
    } catch (error) {
      showToast('error', withApiGuard(error));
    }
  };

  if (!isAuthReady) {
    return <SessionCheckScreen />;
  }

  if (isAuthEnabled && !isAuthenticated) {
    return (
      <>
        <LoginScreen
          email={authEmail}
          password={authPassword}
          error={authError}
          isSubmitting={isAuthSubmitting}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onSubmit={onLogin}
        />
        <ToastViewport toasts={toasts} onDismiss={removeToast} />
      </>
    );
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (dataError && inventory.length === 0 && orders.length === 0 && customers.length === 0) {
    return <DataErrorScreen message={dataError} onRetry={() => void loadData(true)} />;
  }

  return (
    <div className="relative min-h-screen px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-[1320px] overflow-hidden rounded-3xl border border-slate-800/80 bg-[#03070f]/80 shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 px-4 py-4 md:px-6">
          <div className="flex items-center gap-4">
            <span className="h-9 w-1.5 rounded-full bg-gradient-to-b from-red-400 to-red-700 shadow-[0_0_24px_rgba(239,68,68,0.7)]" />
            <div>
              <h1 className="brand-font text-lg font-semibold text-white md:text-2xl">Система Обліку Та Продажу Мотоциклів</h1>
              <p className="text-xs text-slate-400 md:text-sm">{tabTitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {HEADER_LINKS.map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={() => setActiveTab(link.tab)}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  activeTab === link.tab
                    ? 'bg-red-500/16 text-red-300'
                    : 'border border-slate-700/70 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                {link.label}
              </button>
            ))}
            {isAuthEnabled && (
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm font-medium text-red-200"
              >
                <LogOut className="h-4 w-4" />
                Вийти
              </button>
            )}
          </div>
        </header>

        <div className="grid lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="border-r border-slate-800/80 bg-[#060a12]/70 p-3 md:p-4">
            <div className="rounded-2xl border border-slate-800/80 bg-[#0a101d] p-3 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Панель</p>
              <p className="mt-2 font-semibold text-white">{profile.name}</p>
              <p className="text-xs text-slate-400">{profile.role}</p>
            </div>

            <nav className="mt-4 space-y-2">
              {SIDEBAR_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.key === activeTab;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveTab(item.key)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      active
                        ? 'border-red-500/45 bg-red-500/10'
                        : 'border-slate-800/75 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 ${active ? 'text-red-300' : 'text-slate-400'}`} />
                      <div>
                        <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-slate-200'}`}>{item.label}</p>
                        <p className="text-xs text-slate-500">{item.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="space-y-4 p-3 md:space-y-6 md:p-6">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="dashboard-panel faint-gradient p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Мотоцикли На Складі</p>
                <p className="mt-2 text-2xl font-extrabold text-white">{availableUnits}</p>
                <p className="mt-1 text-xs text-slate-400">{inventoryModelsCount} моделей</p>
              </article>

              <article className="dashboard-panel p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Виконано Замовлень</p>
                <p className="mt-2 text-2xl font-extrabold text-white">{finishedOrders}</p>
                <p className="mt-1 text-xs text-slate-400">Всього: {reportsOverview?.summary.totalOrders ?? orders.length}</p>
              </article>

              <article className="dashboard-panel p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Клієнти</p>
                <p className="mt-2 text-xl font-extrabold text-white">Клієнтська база: {customersCount}</p>
                <p className="mt-1 text-xs text-slate-400">Звичайні клієнти</p>
              </article>

              <article className="dashboard-panel p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Оборот По Замовленнях</p>
                <p className="mt-2 text-xl font-extrabold text-white">{formatUsd(totalRevenue)}</p>
                <p className="mt-1 text-xs text-slate-400">Оцінка на основі історії</p>
              </article>
            </section>

            <section className="dashboard-panel p-3 md:p-4">
              {activeTab === 'inventory' && (
                <InventorySection
                  items={inventory}
                  orders={orders}
                  onCreate={handleInventoryCreate}
                  onUpdate={handleInventoryUpdate}
                  onDelete={handleInventoryDelete}
                />
              )}
              {activeTab === 'orders' && (
                <OrdersSection
                  orders={orders}
                  inventory={inventory}
                  customers={customers}
                  onCreate={handleOrderCreate}
                  onUpdateStatus={handleOrderStatus}
                  onDelete={handleOrderDelete}
                />
              )}
              {activeTab === 'customers' && (
                <CustomersSection
                  customers={customers}
                  onCreate={handleCustomerCreate}
                  onUpdate={handleCustomerUpdate}
                  onDelete={handleCustomerDelete}
                />
              )}
              {activeTab === 'reports' && <ReportsSection report={reportsOverview} />}
              {activeTab === 'profile' && <ProfileSection profile={profile} onSave={handleProfileSave} />}
            </section>
          </main>
        </div>
      </div>

      <ToastViewport toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
