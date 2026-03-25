/**
 * HTTP status for permission denials on `message.pinMessage`.
 *
 * A MEMBER must not pin; the API must respond with HTTP 403 (FORBIDDEN), not 500.
 *
 * The earlier version used a stub router + mocked `requirePermission`, which always
 * produced a well-formed FORBIDDEN and hid real HTTP behavior. This file uses the
 * real app, real `message.pinMessage` mutation (POST), and mocks Prisma so tests
 * run without a live database while exercising the same code paths as production.
 */

import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app';

jest.mock('../src/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    server: { findUnique: jest.fn() },
    serverMember: { findUnique: jest.fn() },
  },
}));

import { prisma } from '../src/db/prisma';

const prismaMock = prisma as unknown as {
  user: { findUnique: jest.Mock };
  server: { findUnique: jest.Mock };
  serverMember: { findUnique: jest.Mock };
};

const serverId = '00000000-0000-0000-0000-000000000001';
const memberId = '00000000-0000-0000-0000-0000000000aa';
const messageId = '00000000-0000-0000-0000-0000000000bb';

/** Must match `auth.service` / `JWT_ACCESS_SECRET` (loaded via jest setupFiles: dotenv/config). */
function accessSecretForTest(): string {
  return process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-in-prod';
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ email: 'member@test.com' });
  prismaMock.server.findUnique.mockResolvedValue({ id: serverId });
  prismaMock.serverMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
});

describe('message.pinMessage HTTP — permission denial', () => {
  it('returns 403 FORBIDDEN when a MEMBER attempts to pin (not 500)', async () => {
    const app = createApp();
    const token = jwt.sign({ sub: memberId }, accessSecretForTest(), { expiresIn: '15m' });

    const res = await request(app)
      .post('/trpc/message.pinMessage')
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json')
      .send({ serverId, messageId });

    // Correct contract: permission denial is FORBIDDEN → HTTP 403, never 500.
    // If the implementation still maps this case to 500, this test fails (TDD red).
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.data.code).toBe('FORBIDDEN');
  });
});
