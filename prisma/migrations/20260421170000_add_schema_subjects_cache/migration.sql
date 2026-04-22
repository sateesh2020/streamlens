-- CreateTable
CREATE TABLE "schema_subjects" (
    "id" SERIAL NOT NULL,
    "cluster_id" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "schema_type" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "version_count" INTEGER NOT NULL DEFAULT 1,
    "latest_version" INTEGER NOT NULL DEFAULT 1,
    "compatibility" TEXT NOT NULL DEFAULT '',
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schema_subjects_cluster_id_subject_key" ON "schema_subjects"("cluster_id", "subject");

-- AddForeignKey
ALTER TABLE "schema_subjects" ADD CONSTRAINT "schema_subjects_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
