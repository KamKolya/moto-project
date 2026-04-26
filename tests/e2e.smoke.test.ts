import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

let tempDir = '';

describe('Smoke E2E', () => {
  beforeEach(() => {
    vi.resetModules();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kursova-e2e-'));
    process.env.DB_PATH = path.join(tempDir, 'app.db');
    process.env.AUTH_ENABLED = 'true';
    process.env.AUTH_EMAIL = 'admin@motosys.ua';
    process.env.AUTH_PASSWORD = 'change-me-now';
    process.env.AUTH_SECRET = 'e2e-secret';
  });

  afterEach(() => {
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

  it('runs health -> login -> bootstrap flow on a real HTTP server', async () => {
    const {createApp} = await import('../server/index.ts');

    const app = createApp();
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Cannot resolve server port');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      const health = await fetch(`${baseUrl}/api/health`);
      expect(health.status).toBe(200);

      const login = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: process.env.AUTH_EMAIL,
          password: process.env.AUTH_PASSWORD,
        }),
      });
      expect(login.status).toBe(200);

      const loginBody = (await login.json()) as {token: string};
      expect(Boolean(loginBody.token)).toBe(true);

      const bootstrap = await fetch(`${baseUrl}/api/bootstrap?limit=10&offset=0`, {
        headers: {Authorization: `Bearer ${loginBody.token}`},
      });
      expect(bootstrap.status).toBe(200);

      const bootstrapBody = await bootstrap.json();
      expect(Array.isArray(bootstrapBody.inventory)).toBe(true);
      expect(Array.isArray(bootstrapBody.orders)).toBe(true);
      expect(Array.isArray(bootstrapBody.customers)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });
});
