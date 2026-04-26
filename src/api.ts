import type {CustomerSegment, CustomerStatus, MotorcycleCategory, OrderStatus} from '../shared/domain';
export type {CustomerSegment, CustomerStatus, MotorcycleCategory, OrderStatus} from '../shared/domain';

export type InventoryItem = {
  id: string;
  name: string;
  category: MotorcycleCategory;
  year: string;
  engine: string;
  price: string;
  priceCents: number;
  stock: number;
  onHandStock: number;
  reservedStock: number;
  status: string;
  image: string;
  createdAt: string;
};

export type Order = {
  id: string;
  customer: string;
  phone: string;
  date: string;
  total: string;
  status: OrderStatus;
  items: string;
  quantity: number;
  inventoryId: string;
  customerId: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  segment: CustomerSegment;
  totalOrders: number;
  totalSpent: string;
  status: CustomerStatus;
};

export type Profile = {
  name: string;
  role: string;
  email: string;
  avatar: string;
};

export type BootstrapPayload = {
  inventory: InventoryItem[];
  orders: Order[];
  customers: Customer[];
  profile: Profile;
};

export type ReportsOverview = {
  summary: {
    totalOrders: number;
    completedOrders: number;
    totalRevenue: number;
    averageOrder: number;
    lowStockCount: number;
    totalInventoryItems: number;
    totalStockUnits: number;
    totalCustomers: number;
  };
  statusStats: Array<{
    status: string;
    count: number;
  }>;
  topModels: Array<{
    id: string;
    name: string;
    soldUnits: number;
    revenue: number;
  }>;
  topCustomers: Array<{
    id: string;
    name: string;
    totalOrders: number;
    totalSpent: number;
  }>;
  lowStockItems: Array<{
    id: string;
    name: string;
    category: string;
    stock: number;
  }>;
};

export type AuthUser = {
  email: string;
  role: string;
};

export type AuthMeResponse = {
  authEnabled: boolean;
  user: AuthUser;
};

export type BootstrapQuery = {
  limit?: number;
  offset?: number;
};

type ApiError = Error & {
  status?: number;
};

const AUTH_TOKEN_STORAGE_KEY = 'kursova_auth_token';

let authToken: string | null =
  typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;

export function setAuthToken(token: string | null): void {
  authToken = token;

  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as {error: string}).error)
        : `Request failed with status ${response.status}`;

    const error = new Error(message) as ApiError;
    error.status = response.status;
    throw error;
  }

  return payload as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{token: string; user: AuthUser}>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({email, password}),
    }),

  me: () => request<AuthMeResponse>('/api/auth/me'),

  bootstrap: (query?: BootstrapQuery) => {
    const params = new URLSearchParams();
    if (query?.limit !== undefined) {
      params.set('limit', String(query.limit));
    }
    if (query?.offset !== undefined) {
      params.set('offset', String(query.offset));
    }

    const suffix = params.toString();
    return request<BootstrapPayload>(`/api/bootstrap${suffix ? `?${suffix}` : ''}`);
  },

  reportsOverview: () => request<ReportsOverview>('/api/reports/overview'),

  createInventoryItem: (payload: {
    name: string;
    category: MotorcycleCategory;
    year: string;
    engine: string;
    price: string | number;
    stock: number;
    image?: string;
  }) =>
    request<InventoryItem>('/api/inventory', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateInventoryItem: (
    id: string,
    payload: {
      name: string;
      category: MotorcycleCategory;
      year: string;
      engine: string;
      price: string | number;
      stock: number;
      image?: string;
    },
  ) =>
    request<InventoryItem>(`/api/inventory/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteInventoryItem: (id: string) =>
    request<void>(`/api/inventory/${id}`, {
      method: 'DELETE',
    }),

  createOrder: (
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
  ) =>
    request<Order>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateOrderStatus: (id: string, status: OrderStatus) =>
    request<Order>(`/api/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({status}),
    }),

  deleteOrder: (id: string) =>
    request<void>(`/api/orders/${id}`, {
      method: 'DELETE',
    }),

  createCustomer: (payload: {
    name: string;
    phone: string;
    email: string;
    segment: CustomerSegment;
  }) =>
    request<Customer>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCustomer: (
    id: string,
    payload: {
      name: string;
      phone: string;
      email: string;
      segment: CustomerSegment;
    },
  ) =>
    request<Customer>(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteCustomer: (id: string) =>
    request<void>(`/api/customers/${id}`, {
      method: 'DELETE',
    }),

  updateProfile: (payload: Partial<Profile>) =>
    request<Profile>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
