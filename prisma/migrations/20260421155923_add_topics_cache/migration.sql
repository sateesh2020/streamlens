-- CreateTable
CREATE TABLE "topics" (
    "id" SERIAL NOT NULL,
    "cluster_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "partition_count" INTEGER NOT NULL DEFAULT 0,
    "replication_factor" INTEGER NOT NULL DEFAULT 0,
    "has_under_replicated_partitions" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topics_cluster_id_name_key" ON "topics"("cluster_id", "name");

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
