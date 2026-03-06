import { TRPCError } from '@trpc/server';
import { UserStatus } from '@prisma/client';
import { prisma } from '../db/prisma';

export interface UpdateUserInput {
  displayName?: string;
  avatarUrl?: string | null;
  publicProfile?: boolean;
  status?: UserStatus;
}

export const userService = {
  async getUser(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    return user;
  },

  /** Returns the full profile for the currently authenticated user. */
  async getCurrentUser(userId: string) {
    return userService.getUser(userId);
  },

  async updateUser(userId: string, patch: UpdateUserInput) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.displayName !== undefined && { displayName: patch.displayName }),
        ...(patch.avatarUrl !== undefined && { avatarUrl: patch.avatarUrl }),
        ...(patch.publicProfile !== undefined && { publicProfile: patch.publicProfile }),
        ...(patch.status !== undefined && { status: patch.status }),
      },
    });
  },
};
