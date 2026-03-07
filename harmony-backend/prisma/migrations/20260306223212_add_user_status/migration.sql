-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ONLINE', 'IDLE', 'DND', 'OFFLINE');

-- DropIndex
DROP INDEX IF EXISTS "idx_messages_channel_time";

-- DropIndex
DROP INDEX IF EXISTS "idx_audit_actor";

-- DropIndex
DROP INDEX IF EXISTS "idx_audit_channel_time";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "status" "user_status" NOT NULL DEFAULT 'OFFLINE';
