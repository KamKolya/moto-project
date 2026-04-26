import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  CUSTOMER_SEGMENT_VALUES,
  CUSTOMER_STATUS_VALUES,
  MOTORCYCLE_CATEGORIES,
  ORDER_STATUS_TRANSITIONS,
  ORDER_STATUS_VALUES,
  normalizeCustomerSegment,
  normalizeMotorcycleCategory,
  type CustomerSegment,
  type CustomerStatus,
  type MotorcycleCategory,
  type OrderStatus,
} from '../shared/domain';
import {badRequest, conflict, notFound} from './errors';

type InventoryRow = {
  id: string;
  name: string;
  category: string;
  year: string;
  engine: string;
  price_cents: number;
  stock: number;
  status: string;
  image: string;
  created_at: string;
};

type OrderRow = {
  id: string;
  customer: string;
  phone: string;
  date: string;
  total_cents: number;
  status: string;
  items: string;
  quantity: number;
  inventory_id: string;
  customer_id: string;
  created_at: string;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  segment: string;
  total_orders: number;
  total_spent_cents: number;
  status: string;
  created_at: string;
};

type ProfileRow = {
  id: number;
  name: string;
  role: string;
  email: string;
  avatar: string;
  session_version: number;
  updated_at: string;
};

type TableNames = {
  inventory: string;
  orders: string;
  customers: string;
  profile: string;
};

type BootstrapPayload = {
  inventory: ReturnType<typeof mapInventoryRow>[];
  orders: ReturnType<typeof mapOrderRow>[];
  customers: ReturnType<typeof mapCustomerRow>[];
  profile: ReturnType<typeof mapProfileRow>;
};

type BootstrapQuery = {
  limit?: number;
  offset?: number;
};

type ReportsOverviewPayload = {
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

const STRUCTURE_VERSION = 6;
const SCHEMA_VERSION = 9;
const KYIV_TIME_ZONE = 'Europe/Kyiv';
const DEFAULT_SESSION_VERSION = 1;
const DEFAULT_AVATAR = 'https://i.pravatar.cc/150?img=11';
const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1609630875171-b1321377ee65?auto=format&fit=crop&q=80&w=600';
const PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=600';
const DEFAULT_ORDER_STATUS = ORDER_STATUS_VALUES[0];
const ORDER_STATUS_PENDING_PAYMENT = ORDER_STATUS_VALUES[1];
const ORDER_STATUS_COMPLETED = ORDER_STATUS_VALUES[2];
const ORDER_STATUS_CANCELED = ORDER_STATUS_VALUES[3];
const ORDER_STATUSES = ORDER_STATUS_VALUES;
const ORDER_STATUS_SET = new Set<string>(ORDER_STATUSES);
const RESERVED_ORDER_STATUSES = [DEFAULT_ORDER_STATUS, ORDER_STATUS_PENDING_PAYMENT] as const;
const RESERVED_ORDER_STATUS_SET = new Set<string>(RESERVED_ORDER_STATUSES);
const STATUS_OUT_OF_STOCK = 'Немає';
const STATUS_LOW_STOCK = 'Закінчується';
const STATUS_IN_STOCK = 'В наявності';
const CUSTOMER_STATUS_NEW = CUSTOMER_STATUS_VALUES[0];
const CUSTOMER_STATUS_ACTIVE = CUSTOMER_STATUS_VALUES[1];
const CUSTOMER_STATUSES = CUSTOMER_STATUS_VALUES;
const CUSTOMER_STATUS_SET = new Set<string>(CUSTOMER_STATUSES);
const CUSTOMER_SEGMENT_DEFAULT = CUSTOMER_SEGMENT_VALUES[0];
const CUSTOMER_SEGMENTS = CUSTOMER_SEGMENT_VALUES;
const CUSTOMER_SEGMENT_SET = new Set<string>(CUSTOMER_SEGMENTS);
const MOTORCYCLE_CATEGORY_SQL_VALUES = MOTORCYCLE_CATEGORIES.map((category) => `'${category}'`).join(', ');
const CUSTOMER_SEGMENT_SQL_VALUES = CUSTOMER_SEGMENT_VALUES.map((segment) => `'${segment}'`).join(', ');
const MONEY_SCALE_DRIFT_THRESHOLD_CENTS = 5_000_000;

type InternetCatalogSeedItem = {
  id: string;
  name: string;
  category: MotorcycleCategory;
  year: string;
  engine: string;
  priceCents: number;
  stock: number;
  image: string;
};

const INTERNET_CATALOG_SEED: InternetCatalogSeedItem[] = [
  {
    id: 'W001',
    name: 'Royal Enfield Hunter 350',
    category: 'Роадстер',
    year: '2022',
    engine: '349cc',
    priceCents: 1806,
    stock: 6,
    image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W002',
    name: 'Royal Enfield Classic 350',
    category: 'Класик',
    year: '2021',
    engine: '349cc',
    priceCents: 2292,
    stock: 4,
    image: 'https://images.unsplash.com/photo-1580310614729-ccd69652491d?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W003',
    name: 'Royal Enfield Bullet 350',
    category: 'Класик',
    year: '2023',
    engine: '346cc',
    priceCents: 1896,
    stock: 5,
    image: 'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W004',
    name: 'Royal Enfield Continental GT 650',
    category: 'Кафе-рейсер',
    year: '2024',
    engine: '648cc',
    priceCents: 3674,
    stock: 3,
    image: 'https://images.unsplash.com/photo-1599819811279-d5ad9cccf838?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W005',
    name: 'Royal Enfield Meteor 350',
    category: 'Круїзер',
    year: '2021',
    engine: '349cc',
    priceCents: 2421,
    stock: 4,
    image: 'https://images.unsplash.com/photo-1580310614729-ccd69652491d?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W006',
    name: 'Royal Enfield Himalayan',
    category: 'Адвенчер',
    year: '2023',
    engine: '411cc',
    priceCents: 2601,
    stock: 5,
    image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W007',
    name: 'Royal Enfield Interceptor 650',
    category: 'Роадстер',
    year: '2024',
    engine: '648cc',
    priceCents: 3472,
    stock: 4,
    image: 'https://images.unsplash.com/photo-1581540222194-0def2dda95b8?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W008',
    name: 'Royal Enfield Scram 411',
    category: 'Скремблер',
    year: '2022',
    engine: '411cc',
    priceCents: 2445,
    stock: 5,
    image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W009',
    name: 'TVS Raider 125',
    category: 'Міський',
    year: '2023',
    engine: '124.8cc',
    priceCents: 1091,
    stock: 8,
    image: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W010',
    name: 'TVS Ronin',
    category: 'Роадстер',
    year: '2023',
    engine: '225.9cc',
    priceCents: 1795,
    stock: 6,
    image: 'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W011',
    name: 'TVS Ntorq 125',
    category: 'Скутер',
    year: '2024',
    engine: '124.8cc',
    priceCents: 1036,
    stock: 9,
    image: 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W012',
    name: 'TVS Sport',
    category: 'Міський',
    year: '2024',
    engine: '109.7cc',
    priceCents: 742,
    stock: 10,
    image: 'https://images.unsplash.com/photo-1558979158-65a1eaa08691?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W013',
    name: 'TVS Apache RR 310',
    category: 'Спорт',
    year: '2024',
    engine: '312.2cc',
    priceCents: 3193,
    stock: 3,
    image: 'https://images.unsplash.com/photo-1581540222194-0def2dda95b8?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W014',
    name: 'TVS Apache RTR 200 4V',
    category: 'Нейкед',
    year: '2024',
    engine: '197.75cc',
    priceCents: 1699,
    stock: 5,
    image: 'https://images.unsplash.com/photo-1519750157634-b6d493a0f77c?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W015',
    name: 'TVS Jupiter',
    category: 'Скутер',
    year: '2024',
    engine: '109.7cc',
    priceCents: 921,
    stock: 8,
    image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W016',
    name: 'TVS Jupiter 125',
    category: 'Скутер',
    year: '2024',
    engine: '124.8cc',
    priceCents: 1019,
    stock: 7,
    image: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W017',
    name: 'TVS Star City Plus',
    category: 'Міський',
    year: '2024',
    engine: '109.7cc',
    priceCents: 885,
    stock: 9,
    image: 'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W018',
    name: 'TVS Radeon',
    category: 'Міський',
    year: '2024',
    engine: '109.7cc',
    priceCents: 864,
    stock: 10,
    image: 'https://images.unsplash.com/photo-1519750157634-b6d493a0f77c?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W019',
    name: 'TVS Scooty Pep Plus',
    category: 'Скутер',
    year: '2024',
    engine: '87.8cc',
    priceCents: 778,
    stock: 11,
    image: 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?auto=format&fit=crop&q=80&w=900',
  },
  {
    id: 'W020',
    name: 'TVS XL100 Heavy Duty',
    category: 'Мопед',
    year: '2024',
    engine: '99.7cc',
    priceCents: 568,
    stock: 12,
    image: 'https://images.unsplash.com/photo-1580310614729-ccd69652491d?auto=format&fit=crop&q=80&w=900',
  },
];

const DB_PATH = resolveDbPath(process.env.DB_PATH);

fs.mkdirSync(path.dirname(DB_PATH), {recursive: true});

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
initializeDatabase();

function resolveDbPath(rawPath: string | undefined): string {
  const value = (rawPath || './data/app.db').trim();
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(process.cwd(), value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatDateForTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Cannot format date for ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

function todayKyivDate(now = new Date()): string {
  return formatDateForTimeZone(now, KYIV_TIME_ZONE);
}

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function requiredString(value: unknown, fieldName: string): string {
  const cleaned = cleanString(value);
  if (!cleaned) {
    throw new Error(`${fieldName} is required`);
  }
  return cleaned;
}

function asInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function canonicalizePhone(value: unknown): string | null {
  const digits = cleanString(value).replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  if (/^0\d{9}$/.test(digits)) {
    return `+38${digits}`;
  }
  if (/^380\d{9}$/.test(digits)) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

function normalizePhone(value: unknown, fieldName: string): string {
  const canonical = canonicalizePhone(requiredString(value, fieldName));
  if (!canonical) {
    throw new Error(`${fieldName} is invalid`);
  }
  return canonical;
}

function parseDecimalUnits(value: string): number {
  const cleaned = value.replace(/[^0-9,.\-\s]/g, '').replace(/\s+/g, '').trim();
  if (!cleaned) {
    return Number.NaN;
  }

  const negative = cleaned.startsWith('-');
  const unsigned = cleaned.replace(/-/g, '');
  const lastDot = unsigned.lastIndexOf('.');
  const lastComma = unsigned.lastIndexOf(',');

  if (lastDot === -1 && lastComma === -1) {
    const integerOnly = unsigned.replace(/[.,]/g, '');
    return Number(`${negative ? '-' : ''}${integerOnly}`);
  }

  if (lastDot !== -1 && lastComma !== -1) {
    const decimalIndex = Math.max(lastDot, lastComma);
    const integerPart = unsigned.slice(0, decimalIndex).replace(/[.,]/g, '') || '0';
    const fractionPart = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, '');
    return Number(`${negative ? '-' : ''}${integerPart}.${fractionPart}`);
  }

  const separator = lastDot !== -1 ? '.' : ',';
  const decimalIndex = unsigned.lastIndexOf(separator);
  const firstSeparatorIndex = unsigned.indexOf(separator);
  const digitsAfterSeparator = unsigned.length - decimalIndex - 1;

  if (firstSeparatorIndex !== decimalIndex || digitsAfterSeparator === 3 || digitsAfterSeparator === 0) {
    const integerOnly = unsigned.replace(/[.,]/g, '');
    return Number(`${negative ? '-' : ''}${integerOnly}`);
  }

  const integerPart = unsigned.slice(0, decimalIndex).replace(/[.,]/g, '') || '0';
  const fractionPart = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, '');
  return Number(`${negative ? '-' : ''}${integerPart}.${fractionPart}`);
}

function majorUnitsToCents(value: number): number {
  return Math.round(value * 100);
}

function legacyMoneyToCents(value: unknown): number {
  return Math.max(0, asInt(value, 0)) * 100;
}

function parsePriceCents(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = majorUnitsToCents(value);
    if (rounded < 0) {
      throw new Error('Price cannot be negative');
    }
    return rounded;
  }

  const parsedUnits = parseDecimalUnits(String(value ?? ''));
  if (!Number.isFinite(parsedUnits) || parsedUnits < 0) {
    throw new Error('Invalid price');
  }

  return majorUnitsToCents(parsedUnits);
}

function formatMoney(cents: number): string {
  const safeCents = Math.max(0, Math.round(cents));
  const value = safeCents / 100;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: safeCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function centsToMajorUnits(cents: number): number {
  return Number((Math.max(0, Math.round(cents)) / 100).toFixed(2));
}

function normalizeInventoryCategory(value: unknown, fieldName: string): MotorcycleCategory {
  const normalized = normalizeMotorcycleCategory(requiredString(value, fieldName));
  if (!normalized) {
    throw new Error(`Invalid category. Allowed values: ${MOTORCYCLE_CATEGORIES.join(', ')}`);
  }
  return normalized;
}

function normalizeLegacyInventoryCategory(value: unknown): MotorcycleCategory {
  const normalized = normalizeMotorcycleCategory(cleanString(value));
  return normalized ?? 'Інше';
}

function normalizeModelYear(value: unknown, fieldName: string): string {
  const raw = requiredString(value, fieldName);

  let yearValue = '';
  if (/^\d{4}$/.test(raw)) {
    yearValue = raw;
  } else {
    const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (dateMatch) {
      yearValue = raw.includes('/') ? dateMatch[3] : dateMatch[1];
    } else {
      const embeddedYear = raw.match(/\b(19\d{2}|20\d{2}|21\d{2})\b/);
      yearValue = embeddedYear?.[1] ?? '';
    }
  }

  const year = Number(yearValue);
  const maxYear = new Date().getUTCFullYear() + 1;
  if (!Number.isInteger(year) || year < 1900 || year > maxYear) {
    throw new Error(`Invalid model year. Allowed range: 1900-${maxYear}`);
  }

  return String(year);
}

function normalizeLegacyModelYear(value: unknown): string {
  try {
    return normalizeModelYear(value, 'Inventory year');
  } catch {
    return String(new Date().getUTCFullYear());
  }
}

function stockStatus(stock: number): string {
  if (stock <= 0) {
    return STATUS_OUT_OF_STOCK;
  }
  if (stock <= 3) {
    return STATUS_LOW_STOCK;
  }
  return STATUS_IN_STOCK;
}

function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUS_SET.has(value);
}

function orderReservesInventory(status: OrderStatus): boolean {
  return RESERVED_ORDER_STATUS_SET.has(status);
}

function ensureOrderStatus(value: unknown, fieldName: string): OrderStatus {
  const status = requiredString(value, fieldName);
  if (!isOrderStatus(status)) {
    throw badRequest(`Недопустимий статус замовлення. Дозволено: ${ORDER_STATUSES.join(', ')}`);
  }
  return status;
}

function normalizeOrderStatus(value: unknown): OrderStatus {
  const raw = cleanString(value);
  if (!raw) {
    return DEFAULT_ORDER_STATUS;
  }
  if (isOrderStatus(raw)) {
    return raw;
  }

  const lower = raw.toLowerCase();
  if (lower.includes('викон')) {
    return ORDER_STATUS_COMPLETED;
  }
  if (lower.includes('скас')) {
    return ORDER_STATUS_CANCELED;
  }
  if (lower.includes('очік') || lower.includes('оплат')) {
    return ORDER_STATUS_PENDING_PAYMENT;
  }
  if (lower.includes('оброб')) {
    return DEFAULT_ORDER_STATUS;
  }

  return DEFAULT_ORDER_STATUS;
}

function normalizeLegacySeedOrderStatus(input: {
  id: string;
  inventoryId: string;
  quantity: number;
  totalCents: number;
  status: unknown;
}): OrderStatus {
  const normalized = normalizeOrderStatus(input.status);
  const normalizedTotal = Math.max(0, asInt(input.totalCents, 0));

  if (
    input.id === 'ORD-003' &&
    input.inventoryId === 'M004' &&
    input.quantity === 1 &&
    (normalized === DEFAULT_ORDER_STATUS || normalized === ORDER_STATUS_PENDING_PAYMENT) &&
    (normalizedTotal === 21000 || normalizedTotal === 2100000)
  ) {
    return ORDER_STATUS_COMPLETED;
  }

  return normalized;
}

function ensureAllowedOrderTransition(current: OrderStatus, next: OrderStatus): void {
  if (current === next) {
    return;
  }

  if (!ORDER_STATUS_TRANSITIONS[current].includes(next)) {
    throw badRequest(`Неможливо змінити статус замовлення з "${current}" на "${next}"`);
  }
}

function isCustomerStatus(value: string): value is CustomerStatus {
  return CUSTOMER_STATUS_SET.has(value);
}

function deriveCustomerStatus(totalOrders: number, _totalSpentCents: number): CustomerStatus {
  if (totalOrders > 0) {
    return CUSTOMER_STATUS_ACTIVE;
  }
  return CUSTOMER_STATUS_NEW;
}

function ensureCustomerStatus(value: unknown, fieldName: string): CustomerStatus {
  const status = requiredString(value, fieldName);
  if (!isCustomerStatus(status)) {
    throw badRequest(`Недопустимий статус клієнта. Дозволено: ${CUSTOMER_STATUSES.join(', ')}`);
  }
  return status;
}

function normalizeCustomerStatus(value: unknown, totalOrders: number, totalSpentCents: number): CustomerStatus {
  const raw = cleanString(value);
  if (isCustomerStatus(raw)) {
    return raw;
  }
  return deriveCustomerStatus(totalOrders, totalSpentCents);
}

function isCustomerSegment(value: string): value is CustomerSegment {
  return CUSTOMER_SEGMENT_SET.has(value);
}

function ensureCustomerSegment(value: unknown, fieldName: string): CustomerSegment {
  const raw = requiredString(value, fieldName);
  const normalized = normalizeCustomerSegment(raw);
  if (!normalized || !isCustomerSegment(normalized)) {
    throw badRequest(`Недопустимий сегмент клієнта. Дозволено: ${CUSTOMER_SEGMENTS.join(', ')}`);
  }
  return normalized;
}

function normalizeCustomerSegmentValue(value: unknown): CustomerSegment {
  const normalized = normalizeCustomerSegment(cleanString(value));
  return normalized ?? CUSTOMER_SEGMENT_DEFAULT;
}

function normalizeNamePhoneKey(name: string, phone: string): string {
  return `${name.trim().toLowerCase()}::${phone.trim().toLowerCase()}`;
}

function ensureUniquePhone(phone: string, usedPhones: Set<string>): string {
  const base = phone || 'unknown';
  let candidate = base;
  let suffix = 1;

  while (!candidate || usedPhones.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedPhones.add(candidate.toLowerCase());
  return candidate;
}

function normalizeEmailSeed(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'user';
}

function getReservedQuantityForInventory(inventoryId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS reserved
       FROM orders
       WHERE inventory_id = ?
         AND status IN ('${DEFAULT_ORDER_STATUS}', '${ORDER_STATUS_PENDING_PAYMENT}')`,
    )
    .get(inventoryId) as {reserved: number} | undefined;

  return Math.max(0, asInt(row?.reserved, 0));
}

function mapInventoryRow(row: InventoryRow) {
  const reservedStock = getReservedQuantityForInventory(row.id);
  const onHandStock = Math.max(0, row.stock + reservedStock);

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    year: row.year,
    engine: row.engine,
    price: formatMoney(row.price_cents),
    priceCents: row.price_cents,
    stock: row.stock,
    onHandStock,
    reservedStock,
    status: row.status,
    image: row.image,
    createdAt: row.created_at,
  };
}

function mapOrderRow(row: OrderRow) {
  return {
    id: row.id,
    customer: row.customer,
    phone: row.phone,
    date: row.date,
    total: formatMoney(row.total_cents),
    status: row.status,
    items: row.items,
    quantity: row.quantity,
    inventoryId: row.inventory_id,
    customerId: row.customer_id,
  };
}

function mapCustomerRow(row: CustomerRow) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    segment: normalizeCustomerSegmentValue(row.segment),
    totalOrders: row.total_orders,
    totalSpent: formatMoney(row.total_spent_cents),
    status: row.status,
  };
}

function mapProfileRow(row: ProfileRow) {
  return {
    name: row.name,
    role: row.role,
    email: row.email,
    avatar: row.avatar,
  };
}

export function getAuthProfileState(): {email: string; role: string; sessionVersion: number} {
  ensureProfileRowExists();
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as ProfileRow;

  return {
    email: profile.email,
    role: profile.role,
    sessionVersion: Math.max(DEFAULT_SESSION_VERSION, asInt(profile.session_version, DEFAULT_SESSION_VERSION)),
  };
}

export function getProfile(): ReturnType<typeof mapProfileRow> {
  ensureProfileRowExists();
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as ProfileRow;
  return mapProfileRow(profile);
}

function normalizePagination(options?: BootstrapQuery): {limit?: number; offset: number} {
  const rawLimit = options?.limit === undefined ? undefined : asInt(options.limit, 100);
  const rawOffset = asInt(options?.offset, 0);

  return {
    limit: rawLimit === undefined ? undefined : Math.min(Math.max(rawLimit, 1), 500),
    offset: Math.max(rawOffset, 0),
  };
}

function tableExists(name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(name) as {ok: number} | undefined;
  return Boolean(row?.ok);
}

function getTableColumns(name: string): string[] {
  if (!tableExists(name)) {
    return [];
  }
  const rows = db.prepare(`PRAGMA table_info(${name})`).all() as Array<{name: string}>;
  return rows.map((row) => row.name);
}

function buildTables(suffix = ''): TableNames {
  return {
    inventory: `inventory${suffix}`,
    orders: `orders${suffix}`,
    customers: `customers${suffix}`,
    profile: `profile${suffix}`,
  };
}

function createStrictTables(tables: TableNames): void {
  db.exec(`
    CREATE TABLE ${tables.inventory} (
      id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      category TEXT NOT NULL CHECK (category IN (${MOTORCYCLE_CATEGORY_SQL_VALUES})),
      year TEXT NOT NULL CHECK (length(trim(year)) = 4 AND year GLOB '[0-9][0-9][0-9][0-9]'),
      engine TEXT NOT NULL CHECK (length(trim(engine)) > 0),
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      status TEXT NOT NULL CHECK (length(trim(status)) > 0),
      image TEXT NOT NULL CHECK (length(trim(image)) > 0),
      created_at TEXT NOT NULL
    );

    CREATE TABLE ${tables.customers} (
      id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      phone TEXT NOT NULL UNIQUE CHECK (length(trim(phone)) > 0),
      email TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
      segment TEXT NOT NULL DEFAULT '${CUSTOMER_SEGMENT_DEFAULT}' CHECK (segment IN (${CUSTOMER_SEGMENT_SQL_VALUES})),
      total_orders INTEGER NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
      total_spent_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_spent_cents >= 0),
      status TEXT NOT NULL CHECK (status IN ('${CUSTOMER_STATUS_NEW}', '${CUSTOMER_STATUS_ACTIVE}')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE ${tables.orders} (
      id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
      customer TEXT NOT NULL CHECK (length(trim(customer)) > 0),
      phone TEXT NOT NULL CHECK (length(trim(phone)) > 0),
      date TEXT NOT NULL CHECK (length(trim(date)) > 0),
      total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
      status TEXT NOT NULL CHECK (
        status IN (
          '${DEFAULT_ORDER_STATUS}',
          '${ORDER_STATUS_PENDING_PAYMENT}',
          '${ORDER_STATUS_COMPLETED}',
          '${ORDER_STATUS_CANCELED}'
        )
      ),
      items TEXT NOT NULL CHECK (length(trim(items)) > 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      inventory_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (inventory_id) REFERENCES ${tables.inventory}(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      FOREIGN KEY (customer_id) REFERENCES ${tables.customers}(id) ON UPDATE CASCADE ON DELETE RESTRICT
    );

    CREATE TABLE ${tables.profile} (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      role TEXT NOT NULL CHECK (length(trim(role)) > 0),
      email TEXT NOT NULL CHECK (length(trim(email)) > 0),
      avatar TEXT NOT NULL CHECK (length(trim(avatar)) > 0),
      session_version INTEGER NOT NULL DEFAULT ${DEFAULT_SESSION_VERSION} CHECK (session_version >= ${DEFAULT_SESSION_VERSION}),
      updated_at TEXT NOT NULL
    );
  `);
}

function createStrictIndexes(tables: TableNames): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_${tables.orders}_inventory_id ON ${tables.orders}(inventory_id);
    CREATE INDEX IF NOT EXISTS idx_${tables.orders}_customer_id ON ${tables.orders}(customer_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_${tables.customers}_email_unique ON ${tables.customers}(email);
  `);
}

function ensureProfileRowExists(): void {
  const exists = db.prepare('SELECT 1 AS ok FROM profile WHERE id = 1').get() as {ok: number} | undefined;
  if (exists?.ok) {
    return;
  }

  db.prepare(
    `INSERT INTO profile (id, name, role, email, avatar, session_version, updated_at)
     VALUES (1, @name, @role, @email, @avatar, @sessionVersion, @updatedAt)`,
  ).run({
    name: 'Адміністратор',
    role: 'Адміністратор',
    email: (process.env.AUTH_EMAIL || 'admin@motosys.ua').toLowerCase(),
    avatar: DEFAULT_AVATAR,
    sessionVersion: DEFAULT_SESSION_VERSION,
    updatedAt: nowIso(),
  });
}

function nextId(table: 'inventory' | 'orders' | 'customers', prefix: string, width: number): string {
  const rows = db.prepare(`SELECT id FROM ${table} WHERE id LIKE ?`).all(`${prefix}%`) as Array<{id: string}>;

  let max = 0;
  for (const row of rows) {
    const suffix = row.id.slice(prefix.length);
    const parsed = Number.parseInt(suffix, 10);
    if (Number.isFinite(parsed)) {
      max = Math.max(max, parsed);
    }
  }

  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

function recomputeCustomerStats(customerId: string): void {
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status != '${ORDER_STATUS_CANCELED}' THEN 1 ELSE 0 END), 0) AS totalOrders,
         COALESCE(SUM(CASE WHEN status = '${ORDER_STATUS_COMPLETED}' THEN total_cents ELSE 0 END), 0) AS totalSpent
       FROM orders
       WHERE customer_id = ?`,
    )
    .get(customerId) as {totalOrders: number; totalSpent: number} | undefined;

  const totalOrders = Math.max(0, asInt(totals?.totalOrders, 0));
  const totalSpent = Math.max(0, asInt(totals?.totalSpent, 0));

  db.prepare(
    `UPDATE customers
     SET total_orders = @totalOrders,
         total_spent_cents = @totalSpent,
         status = @status
     WHERE id = @id`,
  ).run({
    id: customerId,
    totalOrders,
    totalSpent,
    status: deriveCustomerStatus(totalOrders, totalSpent),
  });
}

function recomputeAllCustomerStats(): void {
  const rows = db.prepare('SELECT id FROM customers').all() as Array<{id: string}>;
  for (const row of rows) {
    recomputeCustomerStats(row.id);
  }
}

function normalizeInventoryStatuses(): void {
  db.exec(`
    UPDATE inventory
    SET status = CASE
      WHEN stock <= 0 THEN '${STATUS_OUT_OF_STOCK}'
      WHEN stock <= 3 THEN '${STATUS_LOW_STOCK}'
      ELSE '${STATUS_IN_STOCK}'
    END;
  `);
}

function normalizeCustomerStatuses(): void {
  db.exec(`
    UPDATE customers
    SET status = CASE
      WHEN total_orders > 0 THEN '${CUSTOMER_STATUS_ACTIVE}'
      ELSE '${CUSTOMER_STATUS_NEW}'
    END;
  `);
}

function repairCustomerDirectoryData(): void {
  if (!tableExists('customers')) {
    return;
  }

  const customerColumns = getTableColumns('customers');
  if (!customerColumns.includes('segment')) {
    db.exec(`ALTER TABLE customers ADD COLUMN segment TEXT NOT NULL DEFAULT '${CUSTOMER_SEGMENT_DEFAULT}'`);
  }

  const customerRows = db
    .prepare('SELECT id, email, phone, segment FROM customers ORDER BY created_at, id')
    .all() as Array<Pick<CustomerRow, 'id' | 'email' | 'phone' | 'segment'>>;
  const updateCustomer = db.prepare(
    `UPDATE customers
     SET email = @email,
         phone = @phone,
         segment = @segment
     WHERE id = @id`,
  );
  const syncOrderPhones = tableExists('orders')
    ? db.prepare('UPDATE orders SET phone = @phone WHERE customer_id = @customerId')
    : null;
  const usedPhones = new Map<string, string>();

  for (const row of customerRows) {
    const existingPhone = cleanString(row.phone);
    const canonicalPhone = canonicalizePhone(row.phone) ?? existingPhone;
    let phone = canonicalPhone || existingPhone;

    if (phone) {
      const phoneKey = phone.toLowerCase();
      const existingOwner = usedPhones.get(phoneKey);

      // Preserve a legacy value if canonicalization would collide with another row.
      if (existingOwner && existingOwner !== row.id) {
        phone = existingPhone || phone;
      }

      usedPhones.set(phone.toLowerCase(), row.id);
    }

    updateCustomer.run({
      id: row.id,
      email: cleanString(row.email).toLowerCase(),
      phone,
      segment: normalizeCustomerSegmentValue(row.segment),
    });

    if (syncOrderPhones) {
      syncOrderPhones.run({
        customerId: row.id,
        phone,
      });
    }
  }
}

function repairProfileData(): void {
  if (!tableExists('profile')) {
    return;
  }

  const profileColumns = getTableColumns('profile');
  if (!profileColumns.includes('session_version')) {
    db.exec(
      `ALTER TABLE profile ADD COLUMN session_version INTEGER NOT NULL DEFAULT ${DEFAULT_SESSION_VERSION}`,
    );
  }

  const profile = db.prepare('SELECT id, email, session_version FROM profile WHERE id = 1').get() as
    | Pick<ProfileRow, 'id' | 'email' | 'session_version'>
    | undefined;
  if (profile?.id === 1) {
    db.prepare(
      `UPDATE profile
       SET email = @email,
           session_version = @sessionVersion,
           updated_at = @updatedAt
       WHERE id = 1`,
    ).run({
      email: cleanString(profile.email).toLowerCase(),
      sessionVersion: Math.max(DEFAULT_SESSION_VERSION, asInt(profile.session_version, DEFAULT_SESSION_VERSION)),
      updatedAt: nowIso(),
    });
  }
}

function repairRuntimeDataDrift(): void {
  const repair = db.transaction(() => {
    repairCustomerDirectoryData();

    if (tableExists('inventory')) {
      const inventoryRows = db
        .prepare('SELECT id, price_cents FROM inventory WHERE price_cents > ?')
        .all(MONEY_SCALE_DRIFT_THRESHOLD_CENTS) as Array<Pick<InventoryRow, 'id' | 'price_cents'>>;
      const updateInventoryPrice = db.prepare('UPDATE inventory SET price_cents = ? WHERE id = ?');

      for (const row of inventoryRows) {
        updateInventoryPrice.run(Math.max(0, Math.round(asInt(row.price_cents, 0) / 100)), row.id);
      }
    }

    if (tableExists('orders')) {
      const orderRows = db
        .prepare('SELECT id, total_cents FROM orders WHERE total_cents > ?')
        .all(MONEY_SCALE_DRIFT_THRESHOLD_CENTS) as Array<Pick<OrderRow, 'id' | 'total_cents'>>;
      const updateOrderTotal = db.prepare('UPDATE orders SET total_cents = ? WHERE id = ?');

      for (const row of orderRows) {
        updateOrderTotal.run(Math.max(0, Math.round(asInt(row.total_cents, 0) / 100)), row.id);
      }
    }

    repairProfileData();

    recomputeAllCustomerStats();
    normalizeCustomerStatuses();
    normalizeInventoryStatuses();
    createStrictIndexes(buildTables());
  });

  repair();
}

function applyDomainDataFixes(sourceVersion: number): void {
  const shouldConvertLegacyMoney = sourceVersion < 7;
  const shouldRestoreCanceledStock = sourceVersion < 7;

  const applyFixes = db.transaction(() => {
    repairCustomerDirectoryData();

    if (tableExists('inventory')) {
      const rows = db
        .prepare('SELECT id, category, year, price_cents FROM inventory ORDER BY created_at, id')
        .all() as Array<Pick<InventoryRow, 'id' | 'category' | 'year' | 'price_cents'>>;
      const updateInventory = db.prepare(
        `UPDATE inventory
         SET category = @category,
             year = @year,
             price_cents = @priceCents
         WHERE id = @id`,
      );

      for (const row of rows) {
        updateInventory.run({
          id: row.id,
          category: normalizeLegacyInventoryCategory(row.category),
          year: normalizeLegacyModelYear(row.year),
          priceCents: shouldConvertLegacyMoney ? legacyMoneyToCents(row.price_cents) : Math.max(0, asInt(row.price_cents, 0)),
        });
      }
    }

    const canceledAdjustments = new Map<string, number>();
    if (tableExists('orders')) {
      const rows = db
        .prepare('SELECT id, status, total_cents, quantity, inventory_id FROM orders ORDER BY created_at, id')
        .all() as Array<Pick<OrderRow, 'id' | 'status' | 'total_cents' | 'quantity' | 'inventory_id'>>;
      const updateOrder = db.prepare(
        `UPDATE orders
         SET status = @status,
             total_cents = @totalCents
         WHERE id = @id`,
      );

      for (const row of rows) {
        const status = normalizeLegacySeedOrderStatus({
          id: row.id,
          inventoryId: row.inventory_id,
          quantity: Math.max(1, asInt(row.quantity, 1)),
          totalCents: row.total_cents,
          status: row.status,
        });
        updateOrder.run({
          id: row.id,
          status,
          totalCents: shouldConvertLegacyMoney ? legacyMoneyToCents(row.total_cents) : Math.max(0, asInt(row.total_cents, 0)),
        });

        if (shouldRestoreCanceledStock && status === ORDER_STATUS_CANCELED) {
          const quantity = Math.max(1, asInt(row.quantity, 1));
          canceledAdjustments.set(
            row.inventory_id,
            (canceledAdjustments.get(row.inventory_id) ?? 0) + quantity,
          );
        }
      }
    }

    if (tableExists('inventory') && shouldRestoreCanceledStock) {
      const selectInventory = db.prepare('SELECT stock FROM inventory WHERE id = ?');
      const updateInventoryStock = db.prepare('UPDATE inventory SET stock = @stock, status = @status WHERE id = @id');

      for (const [inventoryId, restoreQuantity] of canceledAdjustments.entries()) {
        const inventory = selectInventory.get(inventoryId) as Pick<InventoryRow, 'stock'> | undefined;
        if (!inventory) {
          continue;
        }

        const stock = Math.max(0, asInt(inventory.stock, 0)) + restoreQuantity;
        updateInventoryStock.run({
          id: inventoryId,
          stock,
          status: stockStatus(stock),
        });
      }
    }

    repairProfileData();

    ensureProfileRowExists();
    recomputeAllCustomerStats();
    normalizeCustomerStatuses();
    normalizeInventoryStatuses();
    createStrictIndexes(buildTables());
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  });

  applyFixes();
}

function repairKnownSeedAnomalies(): void {
  if (!tableExists('orders')) {
    return;
  }

  const repair = db.transaction(() => {
    const legacySeedOrder = db
      .prepare('SELECT id, status, inventory_id, quantity, total_cents, customer_id FROM orders WHERE id = ?')
      .get('ORD-003') as
      | Pick<OrderRow, 'id' | 'status' | 'inventory_id' | 'quantity' | 'total_cents' | 'customer_id'>
      | undefined;

    if (!legacySeedOrder) {
      return;
    }

    const normalizedStatus = normalizeLegacySeedOrderStatus({
      id: legacySeedOrder.id,
      inventoryId: legacySeedOrder.inventory_id,
      quantity: Math.max(1, asInt(legacySeedOrder.quantity, 1)),
      totalCents: legacySeedOrder.total_cents,
      status: legacySeedOrder.status,
    });

    if (normalizedStatus === legacySeedOrder.status) {
      return;
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(normalizedStatus, legacySeedOrder.id);
    recomputeCustomerStats(legacySeedOrder.customer_id);
  });

  repair();
}

function initializeDatabase(): void {
  const hasCoreTable = ['inventory', 'customers', 'orders', 'profile'].some((tableName) => tableExists(tableName));
  const currentVersionRaw = db.pragma('user_version', {simple: true});
  const currentVersion = typeof currentVersionRaw === 'number' ? currentVersionRaw : 0;
  const hasCustomerIdInOrders = getTableColumns('orders').includes('customer_id');

  if (!hasCoreTable) {
    const tables = buildTables();
    createStrictTables(tables);
    createStrictIndexes(tables);
    seedIfEmpty();
    normalizeCustomerStatuses();
    normalizeInventoryStatuses();
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    return;
  }

  if (currentVersion < STRUCTURE_VERSION || !hasCustomerIdInOrders) {
    migrateLegacyToV2();
  } else if (currentVersion < SCHEMA_VERSION) {
    applyDomainDataFixes(currentVersion);
  }

  createStrictIndexes(buildTables());
  repairRuntimeDataDrift();
  ensureProfileRowExists();
  repairKnownSeedAnomalies();
  normalizeInventoryStatuses();
  normalizeCustomerStatuses();
}

function seedIfEmpty(): void {
  const inventoryCount = (db.prepare('SELECT COUNT(*) AS count FROM inventory').get() as {count: number}).count;
  const customerCount = (db.prepare('SELECT COUNT(*) AS count FROM customers').get() as {count: number}).count;
  const orderCount = (db.prepare('SELECT COUNT(*) AS count FROM orders').get() as {count: number}).count;

  if (inventoryCount > 0 || customerCount > 0 || orderCount > 0) {
    ensureProfileRowExists();
    return;
  }

  const seed = db.transaction(() => {
    const createdAt = nowIso();

    const insertInventory = db.prepare(
      `INSERT INTO inventory
      (id, name, category, year, engine, price_cents, stock, status, image, created_at)
      VALUES (@id, @name, @category, @year, @engine, @priceCents, @stock, @status, @image, @createdAt)`,
    );

    const insertCustomer = db.prepare(
      `INSERT INTO customers
      (id, name, phone, email, segment, total_orders, total_spent_cents, status, created_at)
      VALUES (@id, @name, @phone, @email, @segment, @totalOrders, @totalSpent, @status, @createdAt)`,
    );

    const insertOrder = db.prepare(
      `INSERT INTO orders
      (id, customer, phone, date, total_cents, status, items, quantity, inventory_id, customer_id, created_at)
      VALUES (@id, @customer, @phone, @date, @totalCents, @status, @items, @quantity, @inventoryId, @customerId, @createdAt)`,
    );

    const inventorySeed: InternetCatalogSeedItem[] = [
      {
        id: 'M001',
        name: 'Ducati Panigale V4',
        category: 'Спорт',
        year: '2021',
        engine: '1100cc',
        priceCents: 22500,
        stock: 4,
        image: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3c87?auto=format&fit=crop&q=80&w=600',
      },
      {
        id: 'M002',
        name: 'Yamaha YZF-R1',
        category: 'Спорт',
        year: '2020',
        engine: '1000cc',
        priceCents: 19800,
        stock: 12,
        image: 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?auto=format&fit=crop&q=80&w=600',
      },
      {
        id: 'M003',
        name: 'Kawasaki Ninja ZX-10R',
        category: 'Спорт',
        year: '2019',
        engine: '998cc',
        priceCents: 18500,
        stock: 2,
        image: 'https://images.unsplash.com/photo-1591637333184-19aa84b3e01f?auto=format&fit=crop&q=80&w=600',
      },
      {
        id: 'M004',
        name: 'BMW S1000RR',
        category: 'Спорт',
        year: '2022',
        engine: '999cc',
        priceCents: 21000,
        stock: 0,
        image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=600',
      },
      {
        id: 'M005',
        name: 'Honda CBR1000RR-R',
        category: 'Спорт',
        year: '2023',
        engine: '1000cc',
        priceCents: 28500,
        stock: 8,
        image: DEFAULT_IMAGE,
      },
    ];

    for (const item of [...inventorySeed, ...INTERNET_CATALOG_SEED]) {
      insertInventory.run({
        id: item.id,
        name: item.name,
        category: item.category,
        year: item.year,
        engine: item.engine,
        priceCents: majorUnitsToCents(item.priceCents),
        stock: item.stock,
        status: stockStatus(item.stock),
        image: item.image || DEFAULT_IMAGE,
        createdAt,
      });
    }

    const customersSeed = [
      {
        id: 'CUST-001',
        name: 'MotoSvit LLC',
        phone: '+38 (050) 123-45-67',
        email: 'info@motosvit.ua',
      },
      {
        id: 'CUST-002',
        name: 'Ivan Petrenko',
        phone: '+38 (067) 987-65-43',
        email: 'ivan.p@email.com',
      },
      {
        id: 'CUST-003',
        name: 'Oleksandr Kovalenko',
        phone: '+38 (063) 456-78-90',
        email: 'alex.kov@email.com',
      },
    ];

    for (const customer of customersSeed) {
      insertCustomer.run({
        id: customer.id,
        name: customer.name,
        phone: normalizePhone(customer.phone, 'Seed customer phone'),
        email: customer.email.toLowerCase(),
        segment: CUSTOMER_SEGMENT_DEFAULT,
        totalOrders: 0,
        totalSpent: 0,
        status: CUSTOMER_STATUS_NEW,
        createdAt,
      });
    }

    const ordersSeed = [
      {
        id: 'ORD-001',
        customer: 'MotoSvit LLC',
        phone: '+38 (050) 123-45-67',
        date: '2023-10-25',
        totalCents: 45000,
        status: ORDER_STATUS_COMPLETED,
        items: '2x Ducati Panigale V4',
        quantity: 2,
        inventoryId: 'M001',
        customerId: 'CUST-001',
      },
      {
        id: 'ORD-002',
        customer: 'Ivan Petrenko',
        phone: '+38 (067) 987-65-43',
        date: '2023-10-26',
        totalCents: 19800,
        status: DEFAULT_ORDER_STATUS,
        items: '1x Yamaha YZF-R1',
        quantity: 1,
        inventoryId: 'M002',
        customerId: 'CUST-002',
      },
      {
        id: 'ORD-003',
        customer: 'Oleksandr Kovalenko',
        phone: '+38 (063) 456-78-90',
        date: '2023-10-27',
        totalCents: 21000,
        status: ORDER_STATUS_COMPLETED,
        items: '1x BMW S1000RR',
        quantity: 1,
        inventoryId: 'M004',
        customerId: 'CUST-003',
      },
    ];

    for (const order of ordersSeed) {
      insertOrder.run({
        id: order.id,
        customer: order.customer,
        phone: normalizePhone(order.phone, 'Seed order phone'),
        date: order.date,
        totalCents: majorUnitsToCents(order.totalCents),
        status: order.status,
        items: order.items,
        quantity: order.quantity,
        inventoryId: order.inventoryId,
        customerId: order.customerId,
        createdAt,
      });
    }

    const reserveOrderInventory = db.prepare(
      `UPDATE inventory
       SET stock = @stock,
           status = @status
       WHERE id = @id`,
    );

    for (const order of ordersSeed) {
      if (!orderReservesInventory(order.status)) {
        continue;
      }

      const inventory = db.prepare('SELECT stock FROM inventory WHERE id = ?').get(order.inventoryId) as
        | Pick<InventoryRow, 'stock'>
        | undefined;

      if (!inventory) {
        continue;
      }

      const availableStock = Math.max(0, asInt(inventory.stock, 0) - order.quantity);
      reserveOrderInventory.run({
        id: order.inventoryId,
        stock: availableStock,
        status: stockStatus(availableStock),
      });
    }

    ensureProfileRowExists();
    recomputeAllCustomerStats();
    normalizeInventoryStatuses();
  });

  seed();
}

function migrateLegacyToV2(): void {
  const oldOrdersColumns = getTableColumns('orders');
  const hasLegacyCustomerId = oldOrdersColumns.includes('customer_id');

  db.pragma('foreign_keys = OFF');

  const migrate = db.transaction(() => {
    const temp = buildTables('_new');

    db.exec(`
      DROP TABLE IF EXISTS ${temp.orders};
      DROP TABLE IF EXISTS ${temp.customers};
      DROP TABLE IF EXISTS ${temp.inventory};
      DROP TABLE IF EXISTS ${temp.profile};
    `);

    createStrictTables(temp);

    const insertInventory = db.prepare(
      `INSERT INTO ${temp.inventory}
      (id, name, category, year, engine, price_cents, stock, status, image, created_at)
      VALUES (@id, @name, @category, @year, @engine, @priceCents, @stock, @status, @image, @createdAt)`,
    );

    const insertCustomer = db.prepare(
      `INSERT INTO ${temp.customers}
      (id, name, phone, email, segment, total_orders, total_spent_cents, status, created_at)
      VALUES (@id, @name, @phone, @email, @segment, @totalOrders, @totalSpent, @status, @createdAt)`,
    );

    const insertOrder = db.prepare(
      `INSERT INTO ${temp.orders}
      (id, customer, phone, date, total_cents, status, items, quantity, inventory_id, customer_id, created_at)
      VALUES (@id, @customer, @phone, @date, @totalCents, @status, @items, @quantity, @inventoryId, @customerId, @createdAt)`,
    );

    const usedInventoryIds = new Set<string>();
    const usedCustomerIds = new Set<string>();
    const usedOrderIds = new Set<string>();
    const usedPhones = new Set<string>();
    const inventoryIdMap = new Map<string, string>();
    const customerIdMap = new Map<string, string>();
    const customerPhoneMap = new Map<string, string>();
    const customerNamePhoneMap = new Map<string, string>();
    const inventoryInfo = new Map<string, {name: string; priceCents: number}>();

    const takeUniqueId = (requested: string, prefix: string, width: number, used: Set<string>) => {
      const cleaned = cleanString(requested);
      if (cleaned && !used.has(cleaned)) {
        used.add(cleaned);
        return cleaned;
      }

      let index = 1;
      while (true) {
        const candidate = `${prefix}${String(index).padStart(width, '0')}`;
        if (!used.has(candidate)) {
          used.add(candidate);
          return candidate;
        }
        index += 1;
      }
    };
    if (tableExists('inventory')) {
      const rows = db.prepare('SELECT * FROM inventory ORDER BY created_at, id').all() as Array<Record<string, unknown>>;
      for (const row of rows) {
        const originalId = cleanString(row.id);
        const id = takeUniqueId(originalId, 'M', 3, usedInventoryIds);
        const name = requiredString(row.name, 'Inventory name');
        const category = normalizeLegacyInventoryCategory(row.category);
        const year = normalizeLegacyModelYear(row.year);
        const engine = requiredString(row.engine, 'Inventory engine');
        const priceCents = legacyMoneyToCents(row.price_cents);
        const stock = Math.max(0, asInt(row.stock, 0));
        const image = cleanString(row.image) || DEFAULT_IMAGE;
        const createdAt = cleanString(row.created_at) || nowIso();

        insertInventory.run({
          id,
          name,
          category,
          year,
          engine,
          priceCents,
          stock,
          status: stockStatus(stock),
          image,
          createdAt,
        });

        if (originalId) {
          inventoryIdMap.set(originalId, id);
        }
        inventoryInfo.set(id, {name, priceCents});
      }
    }

    if (tableExists('customers')) {
      const rows = db.prepare('SELECT * FROM customers ORDER BY created_at, id').all() as Array<Record<string, unknown>>;
      for (const row of rows) {
        const originalId = cleanString(row.id);
        const id = takeUniqueId(originalId, 'CUST-', 3, usedCustomerIds);
        const name = requiredString(row.name, 'Customer name');
        const phone = ensureUniquePhone(canonicalizePhone(row.phone) || cleanString(row.phone) || `unknown-${id}`, usedPhones);
        const email = (cleanString(row.email) || `${normalizeEmailSeed(name)}@local.invalid`).toLowerCase();
        const segment = normalizeCustomerSegmentValue(row.segment);
        const totalOrders = Math.max(0, asInt(row.total_orders, 0));
        const totalSpent = legacyMoneyToCents(row.total_spent_cents);
        const status = normalizeCustomerStatus(row.status, totalOrders, totalSpent);
        const createdAt = cleanString(row.created_at) || nowIso();

        insertCustomer.run({
          id,
          name,
          phone,
          email,
          segment,
          totalOrders,
          totalSpent,
          status,
          createdAt,
        });

        if (originalId) {
          customerIdMap.set(originalId, id);
        }
        customerPhoneMap.set(phone.toLowerCase(), id);
        customerNamePhoneMap.set(normalizeNamePhoneKey(name, phone), id);
      }
    }

    const getCustomerById = db.prepare(`SELECT id, name, phone FROM ${temp.customers} WHERE id = ?`);
    const getInventoryById = db.prepare(`SELECT id, name, price_cents FROM ${temp.inventory} WHERE id = ?`);

    const ensurePlaceholderInventory = (requestedId: string, quantity: number, totalCents: number): string => {
      const id = takeUniqueId(requestedId || 'M', 'M', 3, usedInventoryIds);
      const priceCents = quantity > 0 ? Math.max(0, Math.round(totalCents / quantity)) : 0;
      const name = `Archived item ${id}`;

      insertInventory.run({
        id,
        name,
        category: 'Інше',
        year: String(new Date().getUTCFullYear()),
        engine: 'невідомо',
        priceCents,
        stock: 0,
        status: STATUS_OUT_OF_STOCK,
        image: PLACEHOLDER_IMAGE,
        createdAt: nowIso(),
      });

      inventoryInfo.set(id, {name, priceCents});
      return id;
    };

    const ensureCustomer = (nameInput: string, phoneInput: string): {id: string; name: string; phone: string} => {
      const name = nameInput || 'Unknown customer';
      const phone = canonicalizePhone(phoneInput) || phoneInput || 'unknown-phone';

      const byPhone = customerPhoneMap.get(phone.toLowerCase());
      if (byPhone) {
        const existing = getCustomerById.get(byPhone) as {id: string; name: string; phone: string} | undefined;
        if (existing) {
          return existing;
        }
      }

      const byKey = customerNamePhoneMap.get(normalizeNamePhoneKey(name, phone));
      if (byKey) {
        const existing = getCustomerById.get(byKey) as {id: string; name: string; phone: string} | undefined;
        if (existing) {
          return existing;
        }
      }

      const id = takeUniqueId('', 'CUST-', 3, usedCustomerIds);
      const uniquePhone = ensureUniquePhone(phone || `unknown-${id}`, usedPhones);

      insertCustomer.run({
        id,
        name,
        phone: uniquePhone,
        email: `${normalizeEmailSeed(name)}-${id.toLowerCase()}@local.invalid`,
        segment: CUSTOMER_SEGMENT_DEFAULT,
        totalOrders: 0,
        totalSpent: 0,
        status: CUSTOMER_STATUS_NEW,
        createdAt: nowIso(),
      });

      customerPhoneMap.set(uniquePhone.toLowerCase(), id);
      customerNamePhoneMap.set(normalizeNamePhoneKey(name, uniquePhone), id);
      return {id, name, phone: uniquePhone};
    };

    if (tableExists('orders')) {
      const rows = db.prepare('SELECT * FROM orders ORDER BY created_at, id').all() as Array<Record<string, unknown>>;
      for (const row of rows) {
        const id = takeUniqueId(cleanString(row.id), 'ORD-', 3, usedOrderIds);
        const quantity = Math.max(1, asInt(row.quantity, 1));
        const totalCents = legacyMoneyToCents(row.total_cents);
        const status = normalizeLegacySeedOrderStatus({
          id,
          inventoryId: cleanString(row.inventory_id),
          quantity,
          totalCents: asInt(row.total_cents, 0),
          status: row.status,
        });

        const requestedInventoryId = cleanString(row.inventory_id);
        let inventoryId = inventoryIdMap.get(requestedInventoryId) || requestedInventoryId;
        const inventory = inventoryId
          ? (getInventoryById.get(inventoryId) as {id: string; name: string; price_cents: number} | undefined)
          : undefined;

        if (!inventory) {
          inventoryId = ensurePlaceholderInventory(inventoryId, quantity, totalCents);
        }

        let customerId = '';
        if (hasLegacyCustomerId) {
          const legacyId = cleanString(row.customer_id);
          customerId = customerIdMap.get(legacyId) || legacyId;
        }

        let customer: {id: string; name: string; phone: string} | undefined;
        if (customerId) {
          customer = getCustomerById.get(customerId) as {id: string; name: string; phone: string} | undefined;
        }

        if (!customer) {
          customer = ensureCustomer(cleanString(row.customer), cleanString(row.phone));
          customerId = customer.id;
        }

        const inventoryMeta = inventoryInfo.get(inventoryId) ?? {
          name: `Item ${inventoryId}`,
          priceCents: quantity > 0 ? Math.round(totalCents / quantity) : 0,
        };

        insertOrder.run({
          id,
          customer: cleanString(row.customer) || customer.name,
          phone: customer.phone,
          date: cleanString(row.date) || todayKyivDate(),
          totalCents,
          status,
          items: cleanString(row.items) || `${quantity}x ${inventoryMeta.name}`,
          quantity,
          inventoryId,
          customerId,
          createdAt: cleanString(row.created_at) || nowIso(),
        });
      }
    }

    let profileName = 'Адміністратор';
    let profileRole = 'Адміністратор';
    let profileEmail = process.env.AUTH_EMAIL || 'admin@motosys.ua';
    let profileAvatar = DEFAULT_AVATAR;
    let profileSessionVersion = DEFAULT_SESSION_VERSION;

    if (tableExists('profile')) {
      const row = db
        .prepare('SELECT name, role, email, avatar, session_version FROM profile ORDER BY id LIMIT 1')
        .get() as Record<string, unknown> | undefined;
      if (row) {
        profileName = cleanString(row.name) || profileName;
        profileRole = cleanString(row.role) || profileRole;
        profileEmail = cleanString(row.email) || profileEmail;
        profileAvatar = cleanString(row.avatar) || profileAvatar;
        profileSessionVersion = Math.max(DEFAULT_SESSION_VERSION, asInt(row.session_version, DEFAULT_SESSION_VERSION));
      }
    }

    db.prepare(
      `INSERT INTO ${temp.profile} (id, name, role, email, avatar, session_version, updated_at)
       VALUES (1, @name, @role, @email, @avatar, @sessionVersion, @updatedAt)`,
    ).run({
      name: profileName,
      role: profileRole,
      email: profileEmail,
      avatar: profileAvatar,
      sessionVersion: profileSessionVersion,
      updatedAt: nowIso(),
    });

    const customerRows = db.prepare(`SELECT id FROM ${temp.customers}`).all() as Array<{id: string}>;
    const customerTotals = db.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status != '${ORDER_STATUS_CANCELED}' THEN 1 ELSE 0 END), 0) AS totalOrders,
         COALESCE(SUM(CASE WHEN status = '${ORDER_STATUS_COMPLETED}' THEN total_cents ELSE 0 END), 0) AS totalSpent
       FROM ${temp.orders}
       WHERE customer_id = ?`,
    );
    const updateCustomer = db.prepare(
      `UPDATE ${temp.customers}
       SET total_orders = @totalOrders,
           total_spent_cents = @totalSpent,
           status = @status
       WHERE id = @id`,
    );

    for (const customer of customerRows) {
      const totals = customerTotals.get(customer.id) as {totalOrders: number; totalSpent: number};
      const totalOrders = Math.max(0, asInt(totals.totalOrders, 0));
      const totalSpent = Math.max(0, asInt(totals.totalSpent, 0));

      updateCustomer.run({
        id: customer.id,
        totalOrders,
        totalSpent,
        status: deriveCustomerStatus(totalOrders, totalSpent),
      });
    }

    db.exec(`
      UPDATE ${temp.inventory}
      SET status = CASE
        WHEN stock <= 0 THEN '${STATUS_OUT_OF_STOCK}'
        WHEN stock <= 3 THEN '${STATUS_LOW_STOCK}'
        ELSE '${STATUS_IN_STOCK}'
      END;

      DROP TABLE IF EXISTS orders;
      DROP TABLE IF EXISTS customers;
      DROP TABLE IF EXISTS inventory;
      DROP TABLE IF EXISTS profile;

      ALTER TABLE ${temp.inventory} RENAME TO inventory;
      ALTER TABLE ${temp.customers} RENAME TO customers;
      ALTER TABLE ${temp.orders} RENAME TO orders;
      ALTER TABLE ${temp.profile} RENAME TO profile;
    `);

    createStrictIndexes(buildTables());
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  });

  try {
    migrate();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function getInventoryOrThrow(id: string): InventoryRow {
  const row = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) as InventoryRow | undefined;
  if (!row) {
    throw notFound('Позицію складу не знайдено');
  }
  return row;
}

function getOrderOrThrow(id: string): OrderRow {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
  if (!row) {
    throw notFound('Замовлення не знайдено');
  }
  return row;
}

function getCustomerOrThrow(id: string): CustomerRow {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow | undefined;
  if (!row) {
    throw notFound('Клієнта не знайдено');
  }
  return row;
}

function getCustomerByPhone(phone: string): CustomerRow | undefined {
  const canonicalPhone = canonicalizePhone(phone);
  if (!canonicalPhone) {
    return undefined;
  }
  return db.prepare('SELECT * FROM customers WHERE phone = ?').get(canonicalPhone) as CustomerRow | undefined;
}

function getCustomerByEmail(email: string): CustomerRow | undefined {
  return db.prepare('SELECT * FROM customers WHERE lower(email) = lower(?)').get(email) as CustomerRow | undefined;
}

function ensureCustomerPhoneAvailable(phone: string, excludeId?: string): void {
  const existing = getCustomerByPhone(phone);
  if (existing && existing.id !== excludeId) {
    throw conflict('Клієнт з таким телефоном уже існує');
  }
}

function ensureCustomerEmailAvailable(email: string, excludeId?: string): void {
  const existing = getCustomerByEmail(email);
  if (existing && existing.id !== excludeId) {
    throw conflict('Клієнт з таким email уже існує');
  }
}

function selectRows<T>(table: 'inventory' | 'orders' | 'customers', limit: number | undefined, offset: number): T[] {
  if (limit === undefined) {
    if (offset <= 0) {
      return db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC, id DESC`).all() as T[];
    }
    return db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?`).all(offset) as T[];
  }

  return db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(limit, offset) as T[];
}

export function getBootstrapData(options?: BootstrapQuery): BootstrapPayload {
  const {limit, offset} = normalizePagination(options);

  const inventory = selectRows<InventoryRow>('inventory', limit, offset);
  const orders = selectRows<OrderRow>('orders', limit, offset);
  const customers = selectRows<CustomerRow>('customers', limit, offset);

  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as ProfileRow | undefined;

  return {
    inventory: inventory.map(mapInventoryRow),
    orders: orders.map(mapOrderRow),
    customers: customers.map(mapCustomerRow),
    profile: mapProfileRow(
      profile ?? {
        id: 1,
        name: 'Адміністратор',
        role: 'Адміністратор',
        email: process.env.AUTH_EMAIL || 'admin@motosys.ua',
        avatar: DEFAULT_AVATAR,
        session_version: DEFAULT_SESSION_VERSION,
        updated_at: nowIso(),
      },
    ),
  };
}

export function getReportsOverview(): ReportsOverviewPayload {
  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS totalOrders,
         COALESCE(SUM(CASE WHEN status = '${ORDER_STATUS_COMPLETED}' THEN 1 ELSE 0 END), 0) AS completedOrders,
         COALESCE(SUM(CASE WHEN status = '${ORDER_STATUS_COMPLETED}' THEN total_cents ELSE 0 END), 0) AS totalRevenue,
         COALESCE(ROUND(AVG(CASE WHEN status = '${ORDER_STATUS_COMPLETED}' THEN total_cents END)), 0) AS averageOrder
       FROM orders`,
    )
    .get() as {
    totalOrders: number;
    completedOrders: number;
    totalRevenue: number;
    averageOrder: number;
  };

  const dashboardMeta = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM inventory) AS totalInventoryItems,
         (SELECT COALESCE(SUM(stock), 0) FROM inventory) AS totalStockUnits,
         (SELECT COUNT(*) FROM customers) AS totalCustomers`,
    )
    .get() as {
    totalInventoryItems: number;
    totalStockUnits: number;
    totalCustomers: number;
  };

  const lowStockCountRow = db
    .prepare('SELECT COUNT(*) AS lowStockCount FROM inventory WHERE stock <= 3')
    .get() as {lowStockCount: number};

  const statusStats = db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM orders
       GROUP BY status
       ORDER BY count DESC, status ASC`,
    )
    .all() as Array<{status: string; count: number}>;

  const topModels = db
    .prepare(
      `SELECT
         o.inventory_id AS id,
         COALESCE(i.name, o.items) AS name,
         COALESCE(SUM(o.quantity), 0) AS soldUnits,
         COALESCE(SUM(o.total_cents), 0) AS revenue
       FROM orders o
       LEFT JOIN inventory i ON i.id = o.inventory_id
       WHERE o.status = '${ORDER_STATUS_COMPLETED}'
       GROUP BY o.inventory_id, COALESCE(i.name, o.items)
       ORDER BY soldUnits DESC, revenue DESC, id ASC
       LIMIT 7`,
    )
    .all() as Array<{id: string; name: string; soldUnits: number; revenue: number}>;

  const topCustomers = db
    .prepare(
      `SELECT
         c.id AS id,
         c.name AS name,
         COUNT(o.id) AS totalOrders,
         COALESCE(SUM(o.total_cents), 0) AS totalSpent
       FROM customers c
       JOIN orders o
         ON o.customer_id = c.id
        AND o.status = '${ORDER_STATUS_COMPLETED}'
       GROUP BY c.id, c.name
       ORDER BY totalSpent DESC, totalOrders DESC, id ASC
       LIMIT 7`,
    )
    .all() as Array<{id: string; name: string; totalOrders: number; totalSpent: number}>;

  const lowStockItems = db
    .prepare(
      `SELECT id, name, category, stock
       FROM inventory
       WHERE stock <= 3
       ORDER BY stock ASC, created_at DESC, id DESC`,
    )
    .all() as Array<{id: string; name: string; category: string; stock: number}>;

  return {
    summary: {
      totalOrders: Math.max(0, asInt(summary.totalOrders, 0)),
      completedOrders: Math.max(0, asInt(summary.completedOrders, 0)),
      totalRevenue: centsToMajorUnits(asInt(summary.totalRevenue, 0)),
      averageOrder: centsToMajorUnits(asInt(summary.averageOrder, 0)),
      lowStockCount: Math.max(0, asInt(lowStockCountRow.lowStockCount, 0)),
      totalInventoryItems: Math.max(0, asInt(dashboardMeta.totalInventoryItems, 0)),
      totalStockUnits: Math.max(0, asInt(dashboardMeta.totalStockUnits, 0)),
      totalCustomers: Math.max(0, asInt(dashboardMeta.totalCustomers, 0)),
    },
    statusStats: statusStats.map((row) => ({
      status: row.status,
      count: Math.max(0, asInt(row.count, 0)),
    })),
    topModels: topModels.map((row) => ({
      id: row.id,
      name: row.name,
      soldUnits: Math.max(0, asInt(row.soldUnits, 0)),
      revenue: centsToMajorUnits(asInt(row.revenue, 0)),
    })),
    topCustomers: topCustomers.map((row) => ({
      id: row.id,
      name: row.name,
      totalOrders: Math.max(0, asInt(row.totalOrders, 0)),
      totalSpent: centsToMajorUnits(asInt(row.totalSpent, 0)),
    })),
    lowStockItems: lowStockItems.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      stock: Math.max(0, asInt(row.stock, 0)),
    })),
  };
}

export function createInventoryItem(input: {
  name: string;
  category: string;
  year: string;
  engine: string;
  price: string | number;
  stock: number;
  image?: string;
}) {
  const id = nextId('inventory', 'M', 3);
  const name = requiredString(input.name, 'Name');
  const category = normalizeInventoryCategory(input.category, 'Category');
  const year = normalizeModelYear(input.year, 'Year');
  const engine = requiredString(input.engine, 'Engine');
  const priceCents = parsePriceCents(input.price);
  const stock = Math.max(0, asInt(input.stock, 0));
  const image = cleanString(input.image) || DEFAULT_IMAGE;

  db.prepare(
    `INSERT INTO inventory
    (id, name, category, year, engine, price_cents, stock, status, image, created_at)
    VALUES (@id, @name, @category, @year, @engine, @priceCents, @stock, @status, @image, @createdAt)`,
  ).run({
    id,
    name,
    category,
    year,
    engine,
    priceCents,
    stock,
    status: stockStatus(stock),
    image,
    createdAt: nowIso(),
  });

  return mapInventoryRow(getInventoryOrThrow(id));
}

export function updateInventoryItem(
  id: string,
  input: {
    name: string;
    category: string;
    year: string;
    engine: string;
    price: string | number;
    stock: number;
    image?: string;
  },
) {
  getInventoryOrThrow(id);

  const name = requiredString(input.name, 'Name');
  const category = normalizeInventoryCategory(input.category, 'Category');
  const year = normalizeModelYear(input.year, 'Year');
  const engine = requiredString(input.engine, 'Engine');
  const priceCents = parsePriceCents(input.price);
  const onHandStock = Math.max(0, asInt(input.stock, 0));
  const reservedStock = getReservedQuantityForInventory(id);
  if (onHandStock < reservedStock) {
    throw badRequest(`Неможливо зберегти ${onHandStock} шт. на складі, бо ${reservedStock} шт. уже зарезервовано в активних замовленнях`);
  }

  const stock = onHandStock - reservedStock;
  const image = cleanString(input.image) || DEFAULT_IMAGE;

  db.prepare(
    `UPDATE inventory
     SET name = @name,
         category = @category,
         year = @year,
         engine = @engine,
         price_cents = @priceCents,
         stock = @stock,
         status = @status,
         image = @image
     WHERE id = @id`,
  ).run({
    id,
    name,
    category,
    year,
    engine,
    priceCents,
    stock,
    status: stockStatus(stock),
    image,
  });

  return mapInventoryRow(getInventoryOrThrow(id));
}

export function deleteInventoryItem(id: string): void {
  getInventoryOrThrow(id);

  const linkedOrders = db
    .prepare('SELECT COUNT(*) AS count FROM orders WHERE inventory_id = ?')
    .get(id) as {count: number};

  if (linkedOrders.count > 0) {
    throw badRequest('Не можна видалити позицію складу, поки з нею повʼязані замовлення');
  }

  db.prepare('DELETE FROM inventory WHERE id = ?').run(id);
}

const createOrderTx = db.transaction(
  (
    payload:
      | {inventoryId: string; customerMode: 'existing'; customerId: string; quantity: number}
      | {
          inventoryId: string;
          customerMode: 'new';
          customerName: string;
          phone: string;
          email: string;
          quantity: number;
        },
  ): OrderRow => {
    const inventory = getInventoryOrThrow(requiredString(payload.inventoryId, 'Inventory ID'));
    const quantity = Math.max(1, asInt(payload.quantity, 1));

    if (inventory.stock < quantity) {
      throw badRequest('Недостатньо доступного залишку на складі');
    }

    let customer: CustomerRow;
    if (payload.customerMode === 'existing') {
      customer = getCustomerOrThrow(requiredString(payload.customerId, 'Customer ID'));
    } else {
      const customerNameInput = requiredString(payload.customerName, 'Customer name');
      const phoneInput = normalizePhone(payload.phone, 'Phone');
      const emailInput = requiredString(payload.email, 'Email').toLowerCase();

      ensureCustomerPhoneAvailable(phoneInput);
      ensureCustomerEmailAvailable(emailInput);

      const customerId = nextId('customers', 'CUST-', 3);
      db.prepare(
        `INSERT INTO customers
        (id, name, phone, email, segment, total_orders, total_spent_cents, status, created_at)
        VALUES (@id, @name, @phone, @email, @segment, 0, 0, @status, @createdAt)`,
      ).run({
        id: customerId,
        name: customerNameInput,
        phone: phoneInput,
        email: emailInput,
        segment: CUSTOMER_SEGMENT_DEFAULT,
        status: CUSTOMER_STATUS_NEW,
        createdAt: nowIso(),
      });
      customer = getCustomerOrThrow(customerId);
    }

    const id = nextId('orders', 'ORD-', 3);
    const totalCents = inventory.price_cents * quantity;
    const createdAt = nowIso();

    db.prepare(
      `INSERT INTO orders
      (id, customer, phone, date, total_cents, status, items, quantity, inventory_id, customer_id, created_at)
      VALUES (@id, @customer, @phone, @date, @totalCents, @status, @items, @quantity, @inventoryId, @customerId, @createdAt)`,
    ).run({
      id,
      customer: customer.name,
      phone: customer.phone,
      date: todayKyivDate(),
      totalCents,
      status: DEFAULT_ORDER_STATUS,
      items: `${quantity}x ${inventory.name}`,
      quantity,
      inventoryId: inventory.id,
      customerId: customer.id,
      createdAt,
    });

    const updatedStock = inventory.stock - quantity;
    db.prepare('UPDATE inventory SET stock = ?, status = ? WHERE id = ?').run(
      updatedStock,
      stockStatus(updatedStock),
      inventory.id,
    );

    recomputeCustomerStats(customer.id);
    return getOrderOrThrow(id);
  },
);

export function createOrder(payload: {
  inventoryId: string;
  quantity: number;
} & (
  | {customerMode: 'existing'; customerId: string}
  | {customerMode: 'new'; customerName: string; phone: string; email: string}
)) {
  return mapOrderRow(createOrderTx(payload));
}

const updateOrderStatusTx = db.transaction((id: string, status: string): OrderRow => {
  const order = getOrderOrThrow(id);
  const currentStatus = ensureOrderStatus(order.status, 'Current status');
  const nextStatus = ensureOrderStatus(status, 'Status');

  ensureAllowedOrderTransition(currentStatus, nextStatus);
  if (currentStatus === nextStatus) {
    return order;
  }

  const quantity = Math.max(1, asInt(order.quantity, 1));
  const inventory = getInventoryOrThrow(order.inventory_id);

  if (!orderReservesInventory(currentStatus) && orderReservesInventory(nextStatus)) {
    if (inventory.stock < quantity) {
      throw badRequest('Недостатньо доступного залишку на складі');
    }

    const updatedStock = inventory.stock - quantity;
    db.prepare('UPDATE inventory SET stock = ?, status = ? WHERE id = ?').run(
      updatedStock,
      stockStatus(updatedStock),
      inventory.id,
    );
  }

  if (orderReservesInventory(currentStatus) && nextStatus === ORDER_STATUS_CANCELED) {
    const restoredStock = inventory.stock + quantity;
    db.prepare('UPDATE inventory SET stock = ?, status = ? WHERE id = ?').run(
      restoredStock,
      stockStatus(restoredStock),
      inventory.id,
    );
  }

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(nextStatus, id);
  recomputeCustomerStats(order.customer_id);
  return getOrderOrThrow(id);
});

export function updateOrderStatus(id: string, status: string) {
  return mapOrderRow(updateOrderStatusTx(id, status));
}

const deleteOrderTx = db.transaction((id: string): void => {
  const order = getOrderOrThrow(id);
  const currentStatus = ensureOrderStatus(order.status, 'Current status');

  if (currentStatus === ORDER_STATUS_COMPLETED) {
    throw badRequest('Виконані замовлення видаляти не можна');
  }

  const inventory = db.prepare('SELECT * FROM inventory WHERE id = ?').get(order.inventory_id) as
    | InventoryRow
    | undefined;

  if (inventory && orderReservesInventory(currentStatus)) {
    const restoredStock = inventory.stock + Math.max(1, asInt(order.quantity, 1));
    db.prepare('UPDATE inventory SET stock = ?, status = ? WHERE id = ?').run(
      restoredStock,
      stockStatus(restoredStock),
      inventory.id,
    );
  }

  db.prepare('DELETE FROM orders WHERE id = ?').run(order.id);

  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(order.customer_id) as
    | {id: string}
    | undefined;
  if (customer) {
    recomputeCustomerStats(customer.id);
  }
});

export function deleteOrder(id: string): void {
  deleteOrderTx(id);
}

export function createCustomer(input: {name: string; phone: string; email: string; segment: string}) {
  const id = nextId('customers', 'CUST-', 3);
  const name = requiredString(input.name, 'Name');
  const phone = normalizePhone(input.phone, 'Phone');
  const email = requiredString(input.email, 'Email').toLowerCase();
  const segment = ensureCustomerSegment(input.segment, 'Segment');

  ensureCustomerPhoneAvailable(phone);
  ensureCustomerEmailAvailable(email);

  db.prepare(
    `INSERT INTO customers
    (id, name, phone, email, segment, total_orders, total_spent_cents, status, created_at)
    VALUES (@id, @name, @phone, @email, @segment, 0, 0, @status, @createdAt)`,
  ).run({
    id,
    name,
    phone,
    email,
    segment,
    status: CUSTOMER_STATUS_NEW,
    createdAt: nowIso(),
  });

  recomputeCustomerStats(id);
  return mapCustomerRow(getCustomerOrThrow(id));
}

export function updateCustomer(
  id: string,
  input: {
    name: string;
    phone: string;
    email: string;
    segment: string;
  },
) {
  const existing = getCustomerOrThrow(id);

  const name = requiredString(input.name, 'Name');
  const phone = normalizePhone(input.phone, 'Phone');
  const email = requiredString(input.email, 'Email').toLowerCase();
  const segment = ensureCustomerSegment(input.segment, 'Segment');

  ensureCustomerPhoneAvailable(phone, existing.id);
  ensureCustomerEmailAvailable(email, existing.id);

  db.prepare(
    `UPDATE customers
     SET name = @name,
         phone = @phone,
         email = @email,
         segment = @segment
     WHERE id = @id`,
  ).run({
    id,
    name,
    phone,
    email,
    segment,
  });

  db.prepare('UPDATE orders SET customer = ?, phone = ? WHERE customer_id = ?').run(name, phone, existing.id);

  recomputeCustomerStats(existing.id);
  return mapCustomerRow(getCustomerOrThrow(id));
}

export function deleteCustomer(id: string): void {
  getCustomerOrThrow(id);

  const linkedOrders = db
    .prepare('SELECT COUNT(*) AS count FROM orders WHERE customer_id = ?')
    .get(id) as {count: number};

  if (linkedOrders.count > 0) {
    throw badRequest('Не можна видалити клієнта, поки з ним повʼязані замовлення');
  }

  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
}

export function updateProfile(input: {name?: string; role?: string; email?: string; avatar?: string}) {
  ensureProfileRowExists();
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as ProfileRow;

  const name = cleanString(input.name) || profile.name;
  const role = cleanString(input.role) || profile.role;
  const email = (cleanString(input.email) || profile.email).toLowerCase();
  const avatar = cleanString(input.avatar) || profile.avatar || DEFAULT_AVATAR;
  const currentSessionVersion = Math.max(DEFAULT_SESSION_VERSION, asInt(profile.session_version, DEFAULT_SESSION_VERSION));
  const shouldInvalidateSessions = email !== profile.email || role !== profile.role;
  const sessionVersion = shouldInvalidateSessions ? currentSessionVersion + 1 : currentSessionVersion;

  db.prepare(
    `UPDATE profile
     SET name = @name,
         role = @role,
         email = @email,
         avatar = @avatar,
         session_version = @sessionVersion,
         updated_at = @updatedAt
     WHERE id = 1`,
  ).run({
    name,
    role,
    email,
    avatar,
    sessionVersion,
    updatedAt: nowIso(),
  });

  const updated = db.prepare('SELECT * FROM profile WHERE id = 1').get() as ProfileRow;
  return mapProfileRow(updated);
}
