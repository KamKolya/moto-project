import {describe, expect, it} from 'vitest';
import {getAllowedOrderTransitions, normalizeCustomerSegment} from '../shared/domain';

describe('Shared domain rules', () => {
  it('returns only allowed next statuses for each order state', () => {
    expect(getAllowedOrderTransitions('В обробці')).toEqual(['Очікує оплати', 'Виконано', 'Скасовано']);
    expect(getAllowedOrderTransitions('Очікує оплати')).toEqual(['В обробці', 'Виконано', 'Скасовано']);
    expect(getAllowedOrderTransitions('Виконано')).toEqual([]);
    expect(getAllowedOrderTransitions('Скасовано')).toEqual(['В обробці', 'Очікує оплати']);
  });

  it('normalizes supported customer segment aliases', () => {
    expect(normalizeCustomerSegment('vip')).toBe('VIP');
    expect(normalizeCustomerSegment('опт')).toBe('Оптовий');
    expect(normalizeCustomerSegment('Стандарт')).toBe('Стандарт');
  });
});
