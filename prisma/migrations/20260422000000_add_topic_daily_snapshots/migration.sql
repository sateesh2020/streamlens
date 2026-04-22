-- CreateTable
CREATE TABLE "topic_daily_snapshots" (
    "id" SERIAL NOT NULL,
    "cluster_id" INTEGER NOT NULL,
    "topic_name" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_daily_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topic_daily_snapshots_cluster_id_topic_name_snapshot_date_key"
ON "topic_daily_snapshots"("cluster_id", "topic_name", "snapshot_date");

-- AddForeignKey
ALTER TABLE "topic_daily_snapshots" ADD CONSTRAINT "topic_daily_snapshots_cluster_id_fkey"
FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
