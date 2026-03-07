import { initTRPC, TRPCError } from '@trpc/server';
import type { Request } from 'express';
import { authService } from '../services/auth.service';
import { permissionService, type Action } from '../services/permission.service';

export interface TRPCContext {
  userId: string | null;
  ip: string;
}

export function createContext({ req }: { req: Request }): TRPCContext {
  let userId: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = authService.verifyAccessToken(authHeader.slice(7));
      userId = payload.sub;
    } catch {
      // Invalid token — context userId remains null; authedProcedure will reject
    }
  }

  return { userId, ip: req.ip ?? '' };
}

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;

/** Use for unauthenticated procedures (health, public REST). */
export const publicProcedure = t.procedure;

/** Use for all admin/authenticated tRPC procedures.
 *  Throws UNAUTHORIZED if no userId is present in context. */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

/**
 * Returns a procedure that requires the caller to hold the given `action`
 * permission inside the server identified by `input.serverId`.
 *
 * Usage:
 *   withPermission('channel:create')
 *     .input(z.object({ serverId: z.string().uuid(), ... }))
 *     .mutation(...)
 *
 * The input schema MUST include `serverId: string` (UUID).
 */
export function withPermission(action: Action) {
  return authedProcedure.use(async ({ ctx, getRawInput, next }) => {
    const raw = await getRawInput();
    const input = raw as { serverId?: string };
    const serverId = input?.serverId;
    if (!serverId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'serverId is required for permission checks' });
    }
    await permissionService.requirePermission(ctx.userId, serverId, action);
    return next();
  });
}
