export const ORDER_STATUS_VALUES = ['В обробці', 'Очікує оплати', 'Виконано', 'Скасовано'] as const;
export const CUSTOMER_STATUS_VALUES = ['Новий', 'Активний'] as const;
export const CUSTOMER_SEGMENT_VALUES = ['Стандарт', 'VIP', 'Оптовий'] as const;

export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];
export type CustomerStatus = (typeof CUSTOMER_STATUS_VALUES)[number];
export type CustomerSegment = (typeof CUSTOMER_SEGMENT_VALUES)[number];

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'В обробці': ['Очікує оплати', 'Виконано', 'Скасовано'],
  'Очікує оплати': ['В обробці', 'Виконано', 'Скасовано'],
  Виконано: [],
  Скасовано: ['В обробці', 'Очікує оплати'],
};

export function getAllowedOrderTransitions(status: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[status];
}

export const MOTORCYCLE_CATEGORIES = [
  'Адвенчер',
  'Боббер',
  'Електро',
  'Ендуро',
  'Інше',
  'Кафе-рейсер',
  'Класик',
  'Крос',
  'Круїзер',
  'Міський',
  'Мопед',
  'Нейкед',
  'Роадстер',
  'Скутер',
  'Скремблер',
  'Спорт',
  'Спорт-турер',
  'Турер',
  'Чопер',
] as const;

export type MotorcycleCategory = (typeof MOTORCYCLE_CATEGORIES)[number];

function categoryKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-');
}

const CATEGORY_ALIASES: Record<string, MotorcycleCategory> = {
  commuter: 'Міський',
  'комютер': 'Міський',
  "ком'ютер": 'Міський',
  'комутер': 'Міський',
  'міський': 'Міський',
  'дорожній': 'Роадстер',
  'класичний': 'Класик',
  'пригодницький': 'Адвенчер',
  'спорт турист': 'Спорт-турер',
  'спорт-турист': 'Спорт-турер',
};

const CATEGORY_BY_KEY = new Map<string, MotorcycleCategory>(
  MOTORCYCLE_CATEGORIES.map((category) => [categoryKey(category), category]),
);

function segmentKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

for (const [alias, category] of Object.entries(CATEGORY_ALIASES)) {
  CATEGORY_BY_KEY.set(categoryKey(alias), category);
}

const CUSTOMER_SEGMENT_ALIASES: Record<string, CustomerSegment> = {
  стандарт: 'Стандарт',
  vip: 'VIP',
  оптовий: 'Оптовий',
  опт: 'Оптовий',
  wholesale: 'Оптовий',
};

const CUSTOMER_SEGMENT_BY_KEY = new Map<string, CustomerSegment>(
  CUSTOMER_SEGMENT_VALUES.map((segment) => [segmentKey(segment), segment]),
);

for (const [alias, segment] of Object.entries(CUSTOMER_SEGMENT_ALIASES)) {
  CUSTOMER_SEGMENT_BY_KEY.set(segmentKey(alias), segment);
}

export function normalizeMotorcycleCategory(value: string): MotorcycleCategory | null {
  const normalized = CATEGORY_BY_KEY.get(categoryKey(value));
  return normalized ?? null;
}

export function isMotorcycleCategory(value: string): value is MotorcycleCategory {
  return normalizeMotorcycleCategory(value) !== null;
}

export function normalizeCustomerSegment(value: string): CustomerSegment | null {
  return CUSTOMER_SEGMENT_BY_KEY.get(segmentKey(value)) ?? null;
}

export function isCustomerSegment(value: string): value is CustomerSegment {
  return normalizeCustomerSegment(value) !== null;
}
