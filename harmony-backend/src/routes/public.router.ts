import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { ChannelVisibility } from '@prisma/client';
import { cacheMiddleware } from '../middleware/cache.middleware';
import { CacheTTL } from '../services/cache.service';

export const publicRouter = Router();

/**
 * GET /api/public/channels/:serverSlug/:channelSlug
 * Returns public channel info for PUBLIC_INDEXABLE channels (no auth required).
 */
publicRouter.get(
  '/channels/:serverSlug/:channelSlug',
  cacheMiddleware({
    ttl: CacheTTL.channelMessages,
    keyFn: (req: Request) => `public:channel:${req.params.serverSlug}:${req.params.channelSlug}`,
  }),
  async (req: Request, res: Response) => {
    try {
      const { serverSlug, channelSlug } = req.params;

      const server = await prisma.server.findUnique({ where: { slug: serverSlug } });
      if (!server) {
        res.status(404).json({ error: 'Server not found' });
        return;
      }

      const channel = await prisma.channel.findUnique({
        where: { serverId_slug: { serverId: server.id, slug: channelSlug } },
        select: { id: true, name: true, slug: true, type: true, visibility: true, topic: true },
      });

      if (!channel || channel.visibility !== ChannelVisibility.PUBLIC_INDEXABLE) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      res.json(channel);
    } catch (err) {
      console.error('Public channel route error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * GET /api/public/servers/:serverSlug
 * Returns public server info (no auth required).
 */
publicRouter.get(
  '/servers/:serverSlug',
  cacheMiddleware({
    ttl: CacheTTL.serverInfo,
    keyFn: (req: Request) => `public:server:${req.params.serverSlug}`,
  }),
  async (req: Request, res: Response) => {
    try {
      const server = await prisma.server.findUnique({
        where: { slug: req.params.serverSlug },
        select: { id: true, name: true, slug: true, iconUrl: true, createdAt: true },
      });

      if (!server) {
        res.status(404).json({ error: 'Server not found' });
        return;
      }

      res.json(server);
    } catch (err) {
      console.error('Public server route error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);
