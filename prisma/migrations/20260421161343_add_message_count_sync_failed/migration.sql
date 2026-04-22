-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "message_count_sync_failed" BOOLEAN NOT NULL DEFAULT false;
