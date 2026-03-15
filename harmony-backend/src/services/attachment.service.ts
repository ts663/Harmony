import { TRPCError } from '@trpc/server';
import { prisma } from '../db/prisma';

// ─── Validation constants ─────────────────────────────────────────────────────

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Whitelist of accepted MIME types.
 * Add new types here — rejection is the secure default.
 */
export const ALLOWED_CONTENT_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'text/plain',
  // Common office formats
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// ─── Validation error ─────────────────────────────────────────────────────────

/**
 * Thrown by validateUpload. Using a plain Error (not TRPCError) keeps this
 * service layer transport-agnostic — REST routes catch and map to 400, tRPC
 * callers can re-throw as TRPCError if needed.
 */
export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentValidationError';
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const attachmentService = {
  /**
   * Validate that a file upload is within accepted type and size limits.
   * Throws AttachmentValidationError (a plain Error) on failure so this
   * function stays transport-agnostic and works from both REST and tRPC contexts.
   */
  validateUpload(contentType: string, sizeBytes: number): void {
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new AttachmentValidationError(`Unsupported content type: ${contentType}`);
    }
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new AttachmentValidationError(
        `File exceeds the 25 MB limit (received ${sizeBytes} bytes)`,
      );
    }
  },

  /**
   * Return all attachments for a given message, scoped to a server.
   * Verifies the message belongs to the given server to prevent cross-server
   * probing (a caller with message:read on server A cannot fetch attachments
   * from a message in server B by passing server A's ID).
   */
  async listByMessage(messageId: string, serverId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        isDeleted: true,
        channel: { select: { serverId: true } },
      },
    });

    if (!message || message.isDeleted) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' });
    }

    // Collapse NOT_FOUND and cross-server mismatch to the same error to prevent
    // callers from probing message IDs across servers.
    if (message.channel.serverId !== serverId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' });
    }

    return prisma.attachment.findMany({
      where: { messageId },
      select: {
        id: true,
        filename: true,
        url: true,
        contentType: true,
        // sizeBytes (BigInt) is intentionally excluded — tRPC's default
        // JSON transformer cannot serialize BigInt.
      },
    });
  },
};
