/**
 * User service tests — Issue #98
 *
 * Covers happy-path CRUD operations for user profile management.
 * Requires DATABASE_URL pointing at a running Postgres instance.
 */

import { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { userService } from '../src/services/user.service';

const prisma = new PrismaClient();

let userId: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      username: `testuser-${Date.now()}`,
      displayName: 'Test User',
      publicProfile: true,
    },
  });
  userId = user.id;
});

afterAll(async () => {
  if (userId) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ─── getUser ──────────────────────────────────────────────────────────────────

describe('userService.getUser', () => {
  it('returns a user by id', async () => {
    const user = await userService.getUser(userId);
    expect(user.id).toBe(userId);
    expect(user.displayName).toBe('Test User');
    expect(user.status).toBe('OFFLINE');
  });

  it('throws NOT_FOUND for unknown userId', async () => {
    await expect(
      userService.getUser('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(TRPCError);
  });
});

// ─── getCurrentUser ───────────────────────────────────────────────────────────

describe('userService.getCurrentUser', () => {
  it('returns the authenticated user by id', async () => {
    const user = await userService.getCurrentUser(userId);
    expect(user.id).toBe(userId);
  });

  it('throws NOT_FOUND for unknown userId', async () => {
    await expect(
      userService.getCurrentUser('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(TRPCError);
  });
});

// ─── updateUser ───────────────────────────────────────────────────────────────

describe('userService.updateUser', () => {
  it('updates displayName', async () => {
    const updated = await userService.updateUser(userId, { displayName: 'Updated Name' });
    expect(updated.displayName).toBe('Updated Name');
  });

  it('updates publicProfile to false', async () => {
    const updated = await userService.updateUser(userId, { publicProfile: false });
    expect(updated.publicProfile).toBe(false);
  });

  it('updates status to ONLINE', async () => {
    const updated = await userService.updateUser(userId, { status: 'ONLINE' });
    expect(updated.status).toBe('ONLINE');
  });

  it('updates status to IDLE', async () => {
    const updated = await userService.updateUser(userId, { status: 'IDLE' });
    expect(updated.status).toBe('IDLE');
  });

  it('updates status to DND', async () => {
    const updated = await userService.updateUser(userId, { status: 'DND' });
    expect(updated.status).toBe('DND');
  });

  it('updates avatarUrl', async () => {
    const updated = await userService.updateUser(userId, {
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test',
    });
    expect(updated.avatarUrl).toContain('dicebear');
  });

  it('clears avatarUrl when set to null', async () => {
    const updated = await userService.updateUser(userId, { avatarUrl: null });
    expect(updated.avatarUrl).toBeNull();
  });

  it('throws NOT_FOUND for unknown userId', async () => {
    await expect(
      userService.updateUser('00000000-0000-0000-0000-000000000000', { displayName: 'Ghost' }),
    ).rejects.toThrow(TRPCError);
  });
});
