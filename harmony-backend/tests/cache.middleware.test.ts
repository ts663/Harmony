import express, { Request, Response } from 'express';
import request from 'supertest';
import { cacheMiddleware } from '../src/middleware/cache.middleware';
import { cacheService } from '../src/services/cache.service';
import { redis } from '../src/db/redis';

beforeAll(async () => {
  await redis.connect().catch(() => {});
});

afterAll(async () => {
  await redis.quit();
});

afterEach(async () => {
  const keys = await redis.keys('test:mw:*');
  if (keys.length > 0) await redis.del(...keys);
});

function createTestApp() {
  const app = express();
  let callCount = 0;

  app.get(
    '/cached',
    cacheMiddleware({
      ttl: 60,
      keyFn: (req: Request) => `test:mw:${req.path}`,
    }),
    (_req: Request, res: Response) => {
      callCount++;
      res.json({ count: callCount });
    },
  );

  app.post(
    '/cached',
    cacheMiddleware({
      ttl: 60,
      keyFn: (req: Request) => `test:mw:${req.path}`,
    }),
    (_req: Request, res: Response) => {
      callCount++;
      res.json({ count: callCount });
    },
  );

  return { app, getCallCount: () => callCount };
}

describe('cacheMiddleware', () => {
  it('returns X-Cache: MISS on first request and caches the response', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/cached');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(res.body).toEqual({ count: 1 });

    // Verify it was stored in Redis
    const entry = await cacheService.get('test:mw:/cached');
    expect(entry).not.toBeNull();
    expect(entry!.data).toEqual({ count: 1 });
  });

  it('returns X-Cache: HIT on subsequent requests with cached data', async () => {
    const { app, getCallCount } = createTestApp();

    // First request — cache miss
    await request(app).get('/cached');
    expect(getCallCount()).toBe(1);

    // Second request — cache hit
    const res = await request(app).get('/cached');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.body).toEqual({ count: 1 }); // same cached data
    expect(getCallCount()).toBe(1); // handler not called again
  });

  it('does not cache POST requests', async () => {
    const { app } = createTestApp();

    const res = await request(app).post('/cached');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBeUndefined();
  });

  it('serves fresh data after cache invalidation', async () => {
    const { app, getCallCount } = createTestApp();

    // Populate cache
    await request(app).get('/cached');
    expect(getCallCount()).toBe(1);

    // Invalidate
    await cacheService.invalidate('test:mw:/cached');

    // Should be a miss again
    const res = await request(app).get('/cached');
    expect(res.headers['x-cache']).toBe('MISS');
    expect(res.body).toEqual({ count: 2 });
    expect(getCallCount()).toBe(2);
  });

  it('includes X-Cache-Key header', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/cached');
    expect(res.headers['x-cache-key']).toBe('test:mw:/cached');
  });
});
