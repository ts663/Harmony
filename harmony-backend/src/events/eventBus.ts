/**
 * EventBus — Redis Pub/Sub transport for cross-service events.
 *
 * Design notes:
 * - Redis Pub/Sub requires a dedicated subscriber connection that cannot
 *   issue other commands. We create one lazy subscriber client here and
 *   reuse the shared `redis` publisher client for publishing.
 * - Payloads are serialized as JSON strings on the wire.
 * - All channelId / serverId values in payloads are UUIDs emitted by the
 *   application after DB lookup — they never contain raw user input.
 */

import Redis from 'ioredis';
import { redis } from '../db/redis';
import {
  EventChannelName,
  EventPayloadMap,
  EventHandler,
  EventChannels,
} from './eventTypes';

export { EventChannels, EventChannelName, EventPayloadMap, EventHandler };
export type { VisibilityChangedPayload, MessageCreatedPayload, MessageEditedPayload, MessageDeletedPayload, MetaTagsUpdatedPayload } from './eventTypes';

let subscriberClient: Redis | null = null;

// Per-channel handler count — tracks how many JS handlers are registered for
// each Redis channel so we can unsubscribe at the Redis level precisely when
// the last handler for a given channel is removed.
const channelHandlerCounts = new Map<string, number>();

// Per-channel ready promise — resolves when Redis confirms the subscription.
// All subscribers on the same channel share this promise so latecomers don't
// get a false-immediate-ready before the handshake completes.
const channelReadyPromises = new Map<string, Promise<void>>();

// How long to wait for a Redis subscribe handshake before giving up.
// Resolves (not rejects) so callers never hang — subscription may succeed later.
const SUBSCRIBE_TIMEOUT_MS = 5000;

function getSubscriberClient(): Redis {
  if (!subscriberClient) {
    subscriberClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // subscriber clients must not timeout on blocked commands
      lazyConnect: true,
    });
  }
  return subscriberClient;
}

export const eventBus = {
  /**
   * Publish a typed event. Fire-and-forget: errors are logged, not thrown,
   * so a Redis hiccup never blocks the calling service transaction.
   */
  async publish<C extends EventChannelName>(
    channel: C,
    payload: EventPayloadMap[C],
  ): Promise<void> {
    try {
      await redis.publish(channel, JSON.stringify(payload));
    } catch (err) {
      console.error(`[EventBus] Failed to publish ${channel}:`, err);
    }
  },

  /**
   * Subscribe to a typed event channel.
   * Returns `{ unsubscribe, ready }`:
   *   - `unsubscribe()` removes this handler (and unsubscribes at the Redis level
   *     when the last handler for the channel is removed).
   *   - `ready` is a Promise that resolves when the Redis subscribe handshake
   *     completes, so callers can await it before publishing test messages.
   * Safe to call multiple times — each call registers an additional handler.
   */
  subscribe<C extends EventChannelName>(
    channel: C,
    handler: EventHandler<C>,
  ): { unsubscribe: () => void; ready: Promise<void> } {
    const client = getSubscriberClient();

    const messageListener = (ch: string, message: string) => {
      if (ch !== channel) return;
      try {
        const payload = JSON.parse(message) as EventPayloadMap[C];
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Failed to parse message on ${ch}:`, err);
      }
    };

    const prevCount = channelHandlerCounts.get(channel) ?? 0;
    channelHandlerCounts.set(channel, prevCount + 1);

    let ready: Promise<void>;
    if (prevCount === 0) {
      // First subscriber — issue SUBSCRIBE and store the in-flight handshake promise
      // so subsequent subscribers on the same channel wait for the same confirmation.
      const handshake = new Promise<void>((resolve) => {
        client.subscribe(channel, (err) => {
          if (err) console.error(`[EventBus] Failed to subscribe to ${channel}:`, err);
          resolve(); // resolve even on error so callers never hang
        });
      });
      // Race the handshake against a fallback timeout so callers don't block forever
      // if Redis is temporarily unavailable (subscription may succeed after reconnect).
      ready = Promise.race([
        handshake,
        new Promise<void>((resolve) => setTimeout(resolve, SUBSCRIBE_TIMEOUT_MS)),
      ]);
      channelReadyPromises.set(channel, ready);
    } else {
      // Subsequent subscribers share the same in-flight promise so they wait until
      // Redis actually confirms the subscription rather than resolving immediately.
      ready = channelReadyPromises.get(channel) ?? Promise.resolve();
    }
    client.on('message', messageListener);

    return {
      unsubscribe: () => {
        client.removeListener('message', messageListener);

        const count = (channelHandlerCounts.get(channel) ?? 1) - 1;
        if (count <= 0) {
          channelHandlerCounts.delete(channel);
          channelReadyPromises.delete(channel);
          client.unsubscribe(channel).catch((err) =>
            console.error(`[EventBus] Failed to unsubscribe from ${channel}:`, err),
          );
        } else {
          channelHandlerCounts.set(channel, count);
        }
      },
      ready,
    };
  },

  /** Gracefully disconnect the subscriber client (call on server shutdown). */
  async disconnect(): Promise<void> {
    if (subscriberClient) {
      await subscriberClient.quit().catch(() => {});
      subscriberClient = null;
      channelHandlerCounts.clear();
      channelReadyPromises.clear();
    }
  },
};
