-- AlterTable: add owner_id to servers
ALTER TABLE "servers" ADD COLUMN "owner_id" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
