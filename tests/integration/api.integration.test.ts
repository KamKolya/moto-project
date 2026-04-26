import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

let app: ReturnType<typeof import('../../server/index.ts')['createApp']>;
let tempDir = '';

async function authHeader(email = process.env.AUTH_EMAIL) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({email, password: process.env.AUTH_PASSWORD})
    .expect(200);

  return {Authorization: `Bearer ${String(response.body.token)}`};
}

async function getBootstrap(headers: Record<string, string>) {
  const response = await request(app).get('/api/bootstrap').set(headers).expect(200);
  return response.body as {
    inventory: Array<{
      id: string;
      stock: number;
      onHandStock: number;
      reservedStock: number;
      category: string;
      price: string;
      priceCents: number;
    }>;
    orders: Array<{id: string; status: string; customer: string; customerId: string}>;
    customers: Array<{id: string; phone: string; name: string; email: string; segment: string; status: string; totalOrders: number}>;
    profile: {name: string; email: string; role: string};
  };
}

async function getReports(headers: Record<string, string>) {
  const response = await request(app).get('/api/reports/overview').set(headers).expect(200);
  return response.body as {
    summary: {totalRevenue: number; completedOrders: number};
  };
}

beforeEach(async () => {
  vi.resetModules();

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kursova-int-'));
  process.env.DB_PATH = path.join(tempDir, 'app.db');
  process.env.AUTH_ENABLED = 'true';
  process.env.AUTH_EMAIL = 'admin@motosys.ua';
  process.env.AUTH_PASSWORD = 'change-me-now';
  process.env.AUTH_SECRET = 'integration-secret';

  const module = await import('../../server/index.ts');
  app = module.createApp();
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.DB_PATH;
  delete process.env.AUTH_ENABLED;
  delete process.env.AUTH_EMAIL;
  delete process.env.AUTH_PASSWORD;
  delete process.env.AUTH_SECRET;

  if (tempDir) {
    try {
      fs.rmSync(tempDir, {recursive: true, force: true});
    } catch {
      // SQLite file can remain locked by the process module cache on Windows.
    }
  }
});

describe('API integration', () => {
  it('requires auth for protected routes', async () => {
    await request(app).get('/api/bootstrap').expect(401);
  });

  it('returns bootstrap payload after login', async () => {
    const headers = await authHeader();

    const response = await request(app).get('/api/bootstrap').set(headers).expect(200);

    expect(Array.isArray(response.body.inventory)).toBe(true);
    expect(Array.isArray(response.body.orders)).toBe(true);
    expect(Array.isArray(response.body.customers)).toBe(true);
    expect(response.body.profile).toBeTruthy();
    expect(response.body.inventory[0]).toHaveProperty('onHandStock');
    expect(response.body.inventory[0]).toHaveProperty('reservedStock');
    expect(response.body.customers[0]).toHaveProperty('segment');
  });

  it('validates payloads using zod schemas', async () => {
    const headers = await authHeader();

    const response = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({customerMode: 'new', inventoryId: 'M001', customerName: 'Test User', phone: '+3800000000', quantity: 0})
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
  });

  it('supports bootstrap pagination', async () => {
    const headers = await authHeader();

    const response = await request(app).get('/api/bootstrap?limit=2&offset=0').set(headers).expect(200);

    expect(response.body.inventory.length).toBeLessThanOrEqual(2);
    expect(response.body.orders.length).toBeLessThanOrEqual(2);
    expect(response.body.customers.length).toBeLessThanOrEqual(2);
  });

  it('returns reports overview with SQL aggregates', async () => {
    const headers = await authHeader();

    const response = await request(app).get('/api/reports/overview').set(headers).expect(200);

    expect(response.body.summary).toBeTruthy();
    expect(response.body.summary.totalOrders).toBeGreaterThanOrEqual(0);
    expect(response.body.summary.totalRevenue).toBeGreaterThanOrEqual(0);
    expect(response.body.summary.totalInventoryItems).toBeGreaterThanOrEqual(0);
    expect(response.body.summary.totalStockUnits).toBeGreaterThanOrEqual(0);
    expect(response.body.summary.totalCustomers).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(response.body.statusStats)).toBe(true);
    expect(Array.isArray(response.body.topModels)).toBe(true);
    expect(Array.isArray(response.body.topCustomers)).toBe(true);
    expect(Array.isArray(response.body.lowStockItems)).toBe(true);
  });

  it('rejects invalid order status values', async () => {
    const headers = await authHeader();

    const response = await request(app)
      .put('/api/orders/ORD-001/status')
      .set(headers)
      .send({status: 'INVALID'})
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
  });

  it('accepts allowed order status values', async () => {
    const headers = await authHeader();

    const response = await request(app)
      .put('/api/orders/ORD-002/status')
      .set(headers)
      .send({status: 'Очікує оплати'})
      .expect(200);

    expect(response.body.status).toBe('Очікує оплати');
  });

  it('rejects invalid customer segment values', async () => {
    const headers = await authHeader();

    const response = await request(app)
      .post('/api/customers')
      .set(headers)
      .send({
        name: 'Status Test',
        phone: '+380501112233',
        email: 'status-test@example.com',
        segment: 'Преміум+',
      })
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
  });

  it('creates a customer with a manual segment and derived status', async () => {
    const headers = await authHeader();

    const response = await request(app)
      .post('/api/customers')
      .set(headers)
      .send({
        name: 'Allowed Segment',
        phone: '+380501112244',
        email: 'allowed-segment@example.com',
        segment: 'VIP',
      })
      .expect(201);

    expect(response.body.segment).toBe('VIP');
    expect(response.body.status).toBe('Новий');
  });

  it('rejects non-motorcycle categories', async () => {
    const headers = await authHeader();

    const response = await request(app)
      .post('/api/inventory')
      .set(headers)
      .send({
        name: 'Laptop Bike',
        category: 'Ноутбуки',
        year: '2024',
        engine: '500cc',
        price: '1200',
        stock: 1,
      })
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
  });

  it('seeds only valid motorcycle categories', async () => {
    const headers = await authHeader();
    const bootstrap = await getBootstrap(headers);
    const categories = new Set(bootstrap.inventory.map((item) => item.category));

    expect(categories.has("Ком'ютер")).toBe(false);
    expect(categories.has('Ноутбуки')).toBe(false);
  });

  it('parses decimal prices correctly', async () => {
    const headers = await authHeader();

    const response = await request(app)
      .post('/api/inventory')
      .set(headers)
      .send({
        name: 'Decimal Price',
        category: 'Спорт',
        year: '2024',
        engine: '650cc',
        price: '12.34',
        stock: 1,
      })
      .expect(201);

    expect(response.body.price).toBe('$12.34');
    expect(response.body.onHandStock).toBe(1);
    expect(response.body.reservedStock).toBe(0);
  });

  it('uses the default inventory image when the payload image is blank', async () => {
    const headers = await authHeader();

    const response = await request(app)
      .post('/api/inventory')
      .set(headers)
      .send({
        name: 'Blank Image Price',
        category: 'Спорт',
        year: '2024',
        engine: '650cc',
        price: '1234',
        stock: 1,
        image: '',
      })
      .expect(201);

    expect(response.body.image).toEqual(expect.stringContaining('images.unsplash.com'));
    expect(response.body.image.trim().length).toBeGreaterThan(0);
  });

  it('parses grouped price strings without changing their scale', async () => {
    const headers = await authHeader();

    const grouped = await request(app)
      .post('/api/inventory')
      .set(headers)
      .send({
        name: 'Grouped Price',
        category: 'Спорт',
        year: '2024',
        engine: '900cc',
        price: '$19,800.50',
        stock: 1,
      })
      .expect(201);

    expect(grouped.body.price).toBe('$19,800.50');
    expect(grouped.body.priceCents).toBe(1980050);

    const spaced = await request(app)
      .post('/api/inventory')
      .set(headers)
      .send({
        name: 'Spaced Price',
        category: 'Турер',
        year: '2024',
        engine: '1200cc',
        price: '19 800',
        stock: 1,
      })
      .expect(201);

    expect(spaced.body.price).toBe('$19,800');
    expect(spaced.body.priceCents).toBe(1980000);
  });

  it('keeps the same price when inventory is updated using bootstrap response values', async () => {
    const headers = await authHeader();
    const bootstrap = await getBootstrap(headers);
    const item = bootstrap.inventory.find((entry) => entry.id === 'M002');

    expect(item).toBeTruthy();

    const updated = await request(app)
      .put('/api/inventory/M002')
      .set(headers)
      .send({
        name: 'Yamaha YZF-R1',
        category: item!.category,
        year: '2020',
        engine: '1000cc',
        price: item!.price,
        stock: item!.onHandStock,
        image: 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?auto=format&fit=crop&q=80&w=600',
      })
      .expect(200);

    expect(updated.body.price).toBe(item!.price);
    expect(updated.body.priceCents).toBe(item!.priceCents);
  });

  it('requires explicit selection of an existing customer instead of silently matching by phone', async () => {
    const headers = await authHeader();
    const bootstrap = await getBootstrap(headers);
    const existing = bootstrap.customers.find((customer) => customer.id === 'CUST-002');
    expect(existing).toBeTruthy();

    const rejected = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({
        customerMode: 'new',
        inventoryId: 'M002',
        customerName: 'Інше імʼя',
        phone: existing!.phone,
        email: 'other-client@example.com',
        quantity: 1,
      })
      .expect(409);

    expect(rejected.body.error).toContain('телефоном');

    const created = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({
        customerMode: 'existing',
        inventoryId: 'M002',
        customerId: existing!.id,
        quantity: 1,
      })
      .expect(201);

    expect(created.body.customer).toBe(existing!.name);
  });

  it('returns friendly 409 errors for duplicate customer phone and email', async () => {
    const headers = await authHeader();

    const phoneConflict = await request(app)
      .post('/api/customers')
      .set(headers)
      .send({
        name: 'Phone Conflict',
        phone: '+38 (050) 123-45-67',
        email: 'new-phone-conflict@example.com',
        segment: 'Стандарт',
      })
      .expect(409);

    expect(phoneConflict.body.error).toBe('Клієнт з таким телефоном уже існує');

    const emailConflict = await request(app)
      .post('/api/customers')
      .set(headers)
      .send({
        name: 'Email Conflict',
        phone: '+380501112277',
        email: 'info@motosvit.ua',
        segment: 'Стандарт',
      })
      .expect(409);

    expect(emailConflict.body.error).toBe('Клієнт з таким email уже існує');
  });

  it('rejects duplicate customer phones across formatting variants and stores canonical phone values', async () => {
    const headers = await authHeader();

    const first = await request(app)
      .post('/api/customers')
      .set(headers)
      .send({
        name: 'Canonical Phone',
        phone: '+380991112233',
        email: 'canonical-phone@example.com',
        segment: 'Стандарт',
      })
      .expect(201);

    expect(first.body.phone).toBe('+380991112233');

    const duplicate = await request(app)
      .post('/api/customers')
      .set(headers)
      .send({
        name: 'Formatted Duplicate',
        phone: '+38 (099) 111-22-33',
        email: 'formatted-duplicate@example.com',
        segment: 'Стандарт',
      })
      .expect(409);

    expect(duplicate.body.error).toBe('Клієнт з таким телефоном уже існує');
  });

  it('restores stock on cancel and does not change stock again when deleting canceled order', async () => {
    const headers = await authHeader();
    const before = await getBootstrap(headers);
    const initialStock = before.inventory.find((item) => item.id === 'M002')?.stock;
    expect(initialStock).toBe(11);

    const created = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({
        customerMode: 'new',
        inventoryId: 'M002',
        customerName: 'Stock Flow',
        phone: '+380501112255',
        email: 'stock-flow@example.com',
        quantity: 2,
      })
      .expect(201);

    const afterCreate = await getBootstrap(headers);
    expect(afterCreate.inventory.find((item) => item.id === 'M002')?.stock).toBe(9);

    await request(app)
      .put(`/api/orders/${created.body.id}/status`)
      .set(headers)
      .send({status: 'Скасовано'})
      .expect(200);

    const afterCancel = await getBootstrap(headers);
    expect(afterCancel.inventory.find((item) => item.id === 'M002')?.stock).toBe(11);

    await request(app).delete(`/api/orders/${created.body.id}`).set(headers).expect(204);

    const afterDelete = await getBootstrap(headers);
    expect(afterDelete.inventory.find((item) => item.id === 'M002')?.stock).toBe(11);
  });

  it('prevents deleting completed orders', async () => {
    const headers = await authHeader();

    const response = await request(app).delete('/api/orders/ORD-001').set(headers).expect(400);
    expect(response.body.error).toContain('Виконані замовлення видаляти не можна');
  });

  it('counts revenue only from completed orders', async () => {
    const headers = await authHeader();
    const before = await getReports(headers);

    const created = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({
        customerMode: 'existing',
        inventoryId: 'M002',
        customerId: 'CUST-002',
        quantity: 1,
      })
      .expect(201);

    const afterCreate = await getReports(headers);
    expect(afterCreate.summary.totalRevenue).toBe(before.summary.totalRevenue);

    await request(app)
      .put(`/api/orders/${created.body.id}/status`)
      .set(headers)
      .send({status: 'Виконано'})
      .expect(200);

    const afterComplete = await getReports(headers);
    expect(afterComplete.summary.totalRevenue).toBeGreaterThan(before.summary.totalRevenue);
  });

  it('keeps customer status derived from orders when segment changes', async () => {
    const headers = await authHeader();

    const response = await request(app)
      .put('/api/customers/CUST-002')
      .set(headers)
      .send({
        name: 'Ivan Petrenko',
        phone: '+38 (067) 987-65-43',
        email: 'ivan.p@email.com',
        segment: 'VIP',
      })
      .expect(200);

    expect(response.body.segment).toBe('VIP');
    expect(response.body.status).toBe('Активний');
  });

  it('prevents setting total stock lower than reserved quantity', async () => {
    const headers = await authHeader();

    const response = await request(app)
      .put('/api/inventory/M002')
      .set(headers)
      .send({
        name: 'Yamaha YZF-R1',
        category: 'Спорт',
        year: '2020',
        engine: '1000cc',
        price: '19800',
        stock: 0,
        image: 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?auto=format&fit=crop&q=80&w=600',
      })
      .expect(400);

    expect(response.body.error).toContain('зарезервовано');
  });

  it('invalidates old tokens after email or role changes and allows login with the new identity', async () => {
    const headers = await authHeader();

    await request(app)
      .put('/api/profile')
      .set(headers)
      .send({email: 'manager@motosys.ua', role: 'Менеджер'})
      .expect(200);

    await request(app).get('/api/auth/me').set(headers).expect(401);
    await request(app).get('/api/bootstrap').set(headers).expect(401);

    await request(app)
      .post('/api/auth/login')
      .send({email: 'admin@motosys.ua', password: process.env.AUTH_PASSWORD})
      .expect(401);

    const refreshedHeaders = await authHeader('manager@motosys.ua');
    const me = await request(app).get('/api/auth/me').set(refreshedHeaders).expect(200);
    const bootstrap = await getBootstrap(refreshedHeaders);

    expect(me.body.user.email).toBe('manager@motosys.ua');
    expect(me.body.user.role).toBe('Менеджер');
    expect(bootstrap.profile.email).toBe('manager@motosys.ua');
    expect(bootstrap.profile.role).toBe('Менеджер');
  });

  it('keeps the current token valid when only name or avatar changes', async () => {
    const headers = await authHeader();

    await request(app)
      .put('/api/profile')
      .set(headers)
      .send({
        name: 'Оновлений Адміністратор',
        avatar: 'https://example.com/avatar.png',
      })
      .expect(200);

    const me = await request(app).get('/api/auth/me').set(headers).expect(200);
    const bootstrap = await getBootstrap(headers);

    expect(me.body.user.email).toBe('admin@motosys.ua');
    expect(bootstrap.profile.email).toBe('admin@motosys.ua');
    expect(bootstrap.profile.name).toBe('Оновлений Адміністратор');
  });

  it('uses Europe/Kyiv when creating order dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T22:30:00.000Z'));

    const headers = await authHeader();

    const response = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({
        customerMode: 'existing',
        inventoryId: 'M002',
        customerId: 'CUST-002',
        quantity: 1,
      })
      .expect(201);

    expect(response.body.date).toBe('2026-01-02');
  });
});
