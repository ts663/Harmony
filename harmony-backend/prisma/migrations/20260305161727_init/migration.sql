-- CreateEnum
CREATE TYPE "channel_visibility" AS ENUM ('PUBLIC_INDEXABLE', 'PUBLIC_NO_INDEX', 'PRIVATE');

-- CreateEnum
CREATE TYPE "channel_type" AS ENUM ('TEXT', 'VOICE', 'ANNOUNCEMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "avatar_url" VARCHAR(500),
    "public_profile" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "icon_url" VARCHAR(500),
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "channel_type" "channel_type" NOT NULL DEFAULT 'TEXT',
    "visibility" "channel_visibility" NOT NULL DEFAULT 'PRIVATE',
    "topic" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "indexed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visibility_audit_log" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "old_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" INET NOT NULL,
    "user_agent" VARCHAR(500) NOT NULL,

    CONSTRAINT "visibility_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_meta_tags" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(320) NOT NULL,
    "og_title" VARCHAR(120) NOT NULL,
    "og_description" VARCHAR(320) NOT NULL,
    "og_image" VARCHAR(500),
    "twitter_card" VARCHAR(20) NOT NULL,
    "keywords" TEXT NOT NULL,
    "structured_data" JSONB NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "needs_regeneration" BOOLEAN NOT NULL DEFAULT false,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schema_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "generated_meta_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "idx_servers_slug" ON "servers"("slug");

-- CreateIndex
CREATE INDEX "idx_channels_server_visibility" ON "channels"("server_id", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "idx_channels_server_slug" ON "channels"("server_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "idx_meta_tags_channel" ON "generated_meta_tags"("channel_id");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visibility_audit_log" ADD CONSTRAINT "visibility_audit_log_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visibility_audit_log" ADD CONSTRAINT "visibility_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_meta_tags" ADD CONSTRAINT "generated_meta_tags_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Partial and DESC indexes not expressible in Prisma schema DSL ────────────
-- Reference: docs/unified-backend-architecture.md §4.3

-- Channels: only rows where visibility = PUBLIC_INDEXABLE (for sitemap queries)
CREATE INDEX "idx_channels_visibility_indexed"
  ON "channels"("visibility", "indexed_at")
  WHERE "visibility" = 'PUBLIC_INDEXABLE';

-- Channels: public rows (PUBLIC_INDEXABLE or PUBLIC_NO_INDEX) for guest access
CREATE INDEX "idx_channels_visibility"
  ON "channels"("visibility")
  WHERE "visibility" IN ('PUBLIC_INDEXABLE', 'PUBLIC_NO_INDEX');

-- Messages: all messages ordered newest-first (pagination)
CREATE INDEX "idx_messages_channel_time"
  ON "messages"("channel_id", "created_at" DESC);

-- Messages: non-deleted only (public read path)
CREATE INDEX "idx_messages_channel_not_deleted"
  ON "messages"("channel_id", "created_at" DESC)
  WHERE "is_deleted" = FALSE;

-- Audit log: newest entries first per channel
CREATE INDEX "idx_audit_channel_time"
  ON "visibility_audit_log"("channel_id", "timestamp" DESC);

-- Audit log: actor lookup
CREATE INDEX "idx_audit_actor"
  ON "visibility_audit_log"("actor_id", "timestamp" DESC);

-- Servers: partial index for public servers only
CREATE INDEX "idx_servers_public"
  ON "servers"("is_public")
  WHERE "is_public" = TRUE;

-- Generated meta tags: only rows pending regeneration
CREATE INDEX "idx_meta_tags_needs_regen"
  ON "generated_meta_tags"("needs_regeneration")
  WHERE "needs_regeneration" = TRUE;
