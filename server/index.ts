import {createHmac, timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import express, {type NextFunction, type Request, type Response} from 'express';
import {z, type ZodTypeAny} from 'zod';
import {
  createCustomer,
  createInventoryItem,
  createOrder,
  deleteCustomer,
  deleteInventoryItem,
  deleteOrder,
  getAuthProfileState,
  getBootstrapData,
  getReportsOverview,
  updateCustomer,
  updateInventoryItem,
  updateOrderStatus,
  updateProfile,
} from './db';
import {
  CUSTOMER_SEGMENT_VALUES,
  ORDER_STATUS_VALUES,
  normalizeMotorcycleCategory,
} from '../shared/domain';
import {AppError, mapSqliteError} from './errors';

dotenv.config();

type AuthUser = {
  email: string;
  role: string;
  sessionVersion: number;
  exp: number;
};

type AuthRequest = Request & {
  user?: AuthUser;
};

const DEFAULT_AUTH_EMAIL = 'admin@motosys.ua';
const DEFAULT_AUTH_PASSWORD = '00009999';
const DEFAULT_AUTH_SECRET = 'development-secret-change-me';

const AUTH_EMAIL = process.env.AUTH_EMAIL || DEFAULT_AUTH_EMAIL;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || DEFAULT_AUTH_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET || DEFAULT_AUTH_SECRET;
const AUTH_ENABLED = String(process.env.AUTH_ENABLED ?? 'true').trim().toLowerCase() === 'true';
const AUTH_TTL_MS = 1000 * 60 * 60 * 12;

const IS_LOCAL_RUNTIME = ['development', 'test'].includes(process.env.NODE_ENV ?? 'development');

if (AUTH_ENABLED && !IS_LOCAL_RUNTIME && (AUTH_PASSWORD === DEFAULT_AUTH_PASSWORD || AUTH_SECRET === DEFAULT_AUTH_SECRET)) {
  throw new Error('Refusing to start with default authentication credentials outside local development');
}

const bootstrapQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const inventoryPayloadSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().min(1).transform((value, ctx) => {
    const normalized = normalizeMotorcycleCategory(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Недопустима категорія мотоцикла',
      });
      return z.NEVER;
    }
    return normalized;
  }),
  year: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Рік має бути у форматі YYYY'),
  engine: z.string().trim().min(1),
  price: z.union([z.string(), z.number()]),
  stock: z.coerce.number().int().min(0),
  image: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional(),
  ),
});

const orderPayloadSchema = z.discriminatedUnion('customerMode', [
  z.object({
    customerMode: z.literal('existing'),
    inventoryId: z.string().trim().min(1),
    customerId: z.string().trim().min(1),
    quantity: z.coerce.number().int().min(1),
  }),
  z.object({
    customerMode: z.literal('new'),
    inventoryId: z.string().trim().min(1),
    customerName: z.string().trim().min(1),
    phone: z.string().trim().min(1),
    email: z.string().trim().email(),
    quantity: z.coerce.number().int().min(1),
  }),
]);

const orderStatusPayloadSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES),
});

const customerPayloadSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().email(),
  segment: z.enum(CUSTOMER_SEGMENT_VALUES),
});

const profilePayloadSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  avatar: z.string().trim().min(1).optional(),
});

function getCurrentAuthIdentity(): Omit<AuthUser, 'exp'> {
  const profile = getAuthProfileState();
  return {
    email: profile.email || AUTH_EMAIL,
    role: profile.role || 'admin',
    sessionVersion: profile.sessionVersion,
  };
}

function signToken(user: Omit<AuthUser, 'exp'>): string {
  const payload: AuthUser = {
    ...user,
    exp: Date.now() + AUTH_TTL_MS,
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', AUTH_SECRET).update(payloadEncoded).digest('base64url');
  return `${payloadEncoded}.${signature}`;
}

function verifyToken(token: string): AuthUser {
  const [payloadEncoded, signature] = token.split('.');
  if (!payloadEncoded || !signature) {
    throw new Error('Invalid auth token');
  }

  const expectedSignature = createHmac('sha256', AUTH_SECRET).update(payloadEncoded).digest();
  const providedSignature = Buffer.from(signature, 'base64url');

  if (expectedSignature.length !== providedSignature.length) {
    throw new Error('Invalid auth token signature');
  }
  if (!timingSafeEqual(expectedSignature, providedSignature)) {
    throw new Error('Invalid auth token signature');
  }

  const payloadRaw = Buffer.from(payloadEncoded, 'base64url').toString('utf8');
  const payload = JSON.parse(payloadRaw) as AuthUser;
  if (!payload.exp || payload.exp < Date.now()) {
    throw new Error('Auth token expired');
  }
  if (!payload.email || !payload.role || !Number.isInteger(payload.sessionVersion)) {
    throw new Error('Invalid auth payload');
  }

  const currentIdentity = getCurrentAuthIdentity();
  if (
    payload.email.toLowerCase() !== currentIdentity.email.toLowerCase() ||
    payload.role !== currentIdentity.role ||
    payload.sessionVersion !== currentIdentity.sessionVersion
  ) {
    throw new Error('Auth token is stale');
  }

  return payload;
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({error: 'Неавторизовано'});
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({error: 'Неавторизовано'});
  }
}

function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Validation failed', details: parsed.error.flatten()});
      return;
    }

    req.body = parsed.data;
    next();
  };
}

export function createApp() {
  const app = express();

  app.use(express.json({limit: '5mb'}));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const identity = getCurrentAuthIdentity();

    if (email !== identity.email.toLowerCase() || password !== AUTH_PASSWORD) {
      res.status(401).json({error: 'Невірний email або пароль'});
      return;
    }

    const token = signToken(identity);
    res.json({
      token,
      user: {
        email: identity.email,
        role: identity.role,
      },
    });
  });

  app.use('/api', (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.path === '/health' || req.path === '/auth/login') {
      next();
      return;
    }

    if (!AUTH_ENABLED) {
      req.user = {
        ...getCurrentAuthIdentity(),
        exp: Number.MAX_SAFE_INTEGER,
      };
      next();
      return;
    }

    requireAuth(req, res, next);
  });

  app.get('/api/auth/me', (req: AuthRequest, res: Response) => {
    const identity = getCurrentAuthIdentity();
    res.json({
      authEnabled: AUTH_ENABLED,
      user: {
        email: identity.email,
        role: identity.role,
      },
    });
  });

  app.get('/api/bootstrap', (req: Request, res: Response) => {
    const parsed = bootstrapQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({error: 'Validation failed', details: parsed.error.flatten()});
      return;
    }

    const {limit, offset} = parsed.data;
    res.json(getBootstrapData({limit, offset}));
  });

  app.get('/api/reports/overview', (_req: Request, res: Response) => {
    res.json(getReportsOverview());
  });

  app.post('/api/inventory', validateBody(inventoryPayloadSchema), (req: Request, res: Response) => {
    const payload = inventoryPayloadSchema.parse(req.body);
    const created = createInventoryItem({
      name: payload.name!,
      category: payload.category!,
      year: payload.year!,
      engine: payload.engine!,
      price: payload.price!,
      stock: payload.stock!,
      image: payload.image,
    });
    res.status(201).json(created);
  });

  app.put('/api/inventory/:id', validateBody(inventoryPayloadSchema), (req: Request, res: Response) => {
    const payload = inventoryPayloadSchema.parse(req.body);
    const updated = updateInventoryItem(req.params.id, {
      name: payload.name!,
      category: payload.category!,
      year: payload.year!,
      engine: payload.engine!,
      price: payload.price!,
      stock: payload.stock!,
      image: payload.image,
    });
    res.json(updated);
  });

  app.delete('/api/inventory/:id', (req: Request, res: Response) => {
    deleteInventoryItem(req.params.id);
    res.status(204).send();
  });

  app.post('/api/orders', validateBody(orderPayloadSchema), (req: Request, res: Response) => {
    const payload = orderPayloadSchema.parse(req.body);
    const created =
      payload.customerMode === 'existing'
        ? createOrder({
            customerMode: 'existing',
            inventoryId: payload.inventoryId,
            customerId: payload.customerId,
            quantity: payload.quantity,
          })
        : createOrder({
            customerMode: 'new',
            inventoryId: payload.inventoryId,
            customerName: payload.customerName,
            phone: payload.phone,
            email: payload.email,
            quantity: payload.quantity,
          });
    res.status(201).json(created);
  });

  app.put('/api/orders/:id/status', validateBody(orderStatusPayloadSchema), (req: Request, res: Response) => {
    const {status} = req.body as z.infer<typeof orderStatusPayloadSchema>;
    const updated = updateOrderStatus(req.params.id, status);
    res.json(updated);
  });

  app.delete('/api/orders/:id', (req: Request, res: Response) => {
    deleteOrder(req.params.id);
    res.status(204).send();
  });

  app.post('/api/customers', validateBody(customerPayloadSchema), (req: Request, res: Response) => {
    const payload = customerPayloadSchema.parse(req.body);
    const created = createCustomer({
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      segment: payload.segment,
    });
    res.status(201).json(created);
  });

  app.put('/api/customers/:id', validateBody(customerPayloadSchema), (req: Request, res: Response) => {
    const payload = customerPayloadSchema.parse(req.body);
    const updated = updateCustomer(req.params.id, {
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      segment: payload.segment,
    });
    res.json(updated);
  });

  app.delete('/api/customers/:id', (req: Request, res: Response) => {
    deleteCustomer(req.params.id);
    res.status(204).send();
  });

  app.put('/api/profile', validateBody(profilePayloadSchema), (req: Request, res: Response) => {
    const updated = updateProfile(req.body as z.infer<typeof profilePayloadSchema>);
    res.json(updated);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({error: err.message});
      return;
    }

    const sqliteError = mapSqliteError(err);
    if (sqliteError) {
      res.status(sqliteError.status).json({error: sqliteError.message});
      return;
    }

    const message = err instanceof Error ? err.message : 'Unexpected server error';
    const lower = message.toLowerCase();

    let status = 400;
    if (lower.includes('not found')) {
      status = 404;
    } else if (lower.includes('unauthorized') || lower.includes('forbidden')) {
      status = 401;
    } else if (lower.includes('constraint') || lower.includes('already exists')) {
      status = 409;
    }

    res.status(status).json({error: message});
  });

  return app;
}

export const app = createApp();

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const port = Number(process.env.PORT ?? 4000);

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] running on http://localhost:${port}`);
  });
}
