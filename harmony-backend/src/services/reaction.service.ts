import { TRPCError } from '@trpc/server';
import { prisma } from '../db/prisma';
import { cacheService, sanitizeKeySegment } from './cache.service';
import { eventBus, EventChannels } from '../events/eventBus';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AddReactionInput {
  messageId: string;
  userId: string;
  emoji: string;
  serverId: string;
}

export interface RemoveReactionInput {
  messageId: string;
  userId: string;
  emoji: string;
  serverId: string;
}

export interface GetMessageReactionsInput {
  messageId: string;
  serverId: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a message (non-deleted) and assert its channel belongs to `serverId`.
 * Throws NOT_FOUND when the message does not exist, is deleted, or belongs to
 * a different server — collapsed to a single error code to prevent probing.
 */
async function requireMessageInServer(messageId: string, serverId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { channel: { select: { serverId: true, id: true } } },
  });
  if (!message || message.isDeleted || message.channel.serverId !== serverId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found in this server' });
  }
  return message;
}

/** Cache key for all reactions on a message, scoped to server to prevent cross-server probing. */
function reactionCacheKey(serverId: string, messageId: string): string {
  return `reactions:${sanitizeKeySegment(serverId)}:${sanitizeKeySegment(messageId)}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const reactionService = {
  /**
   * Add an emoji reaction to a message.
   * Validates the message exists in the server; throws CONFLICT if the user
   * has already reacted with the same emoji.
   */
  async addReaction(input: AddReactionInput) {
    const { messageId, userId, emoji, serverId } = input;

    const message = await requireMessageInServer(messageId, serverId);

    try {
      const reaction = await prisma.messageReaction.create({
        data: { messageId, userId, emoji },
      });

      cacheService.invalidatePattern(reactionCacheKey(serverId, messageId)).catch(() => {});

      eventBus
        .publish(EventChannels.REACTION_ADDED, {
          messageId,
          channelId: message.channel.id,
          userId,
          emoji,
          timestamp: reaction.createdAt.toISOString(),
        })
        .catch(() => {});

      return reaction;
    } catch (err: unknown) {
      // Prisma unique constraint violation — P2002
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You have already reacted with this emoji',
        });
      }
      throw err;
    }
  },

  /**
   * Remove an emoji reaction from a message.
   * Only the reaction owner may remove it; throws FORBIDDEN otherwise.
   */
  async removeReaction(input: RemoveReactionInput) {
    const { messageId, userId, emoji, serverId } = input;

    const message = await requireMessageInServer(messageId, serverId);

    // Look up the caller's own reaction
    const callerReaction = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });

    if (!callerReaction) {
      // Distinguish: does the reaction exist but belong to someone else?
      const anyReaction = await prisma.messageReaction.findFirst({
        where: { messageId, emoji },
      });
      if (anyReaction) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only remove your own reactions',
        });
      }
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Reaction not found' });
    }

    await prisma.messageReaction.delete({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });

    cacheService.invalidatePattern(reactionCacheKey(serverId, messageId)).catch(() => {});

    eventBus
      .publish(EventChannels.REACTION_REMOVED, {
        messageId,
        channelId: message.channel.id,
        userId,
        emoji,
        timestamp: new Date().toISOString(),
      })
      .catch(() => {});
  },

  /**
   * Return all reactions for a message, grouped by emoji with counts and
   * the list of user IDs who reacted.
   * Shape: `{ emoji, count, userIds[] }[]`
   */
  async getMessageReactions(input: GetMessageReactionsInput): Promise<ReactionGroup[]> {
    const { messageId, serverId } = input;

    await requireMessageInServer(messageId, serverId);

    const reactions = await prisma.messageReaction.findMany({
      where: { messageId },
      select: { emoji: true, userId: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by emoji
    const grouped = new Map<string, string[]>();
    for (const r of reactions) {
      const existing = grouped.get(r.emoji);
      if (existing) {
        existing.push(r.userId);
      } else {
        grouped.set(r.emoji, [r.userId]);
      }
    }

    return Array.from(grouped.entries()).map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      userIds,
    }));
  },
};
