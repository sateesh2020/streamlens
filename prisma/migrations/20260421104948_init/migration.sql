-- CreateTable
CREATE TABLE "clusters" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "brokers" TEXT NOT NULL,
    "auth_type" TEXT NOT NULL DEFAULT 'none',
    "auth_config" JSONB NOT NULL DEFAULT '{}',
    "schema_registry_url" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);
