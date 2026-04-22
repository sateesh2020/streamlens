import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { Cluster } from "@/types"
import { ConsumerGroupsClient } from "./consumer-groups-client"

interface ConsumerGroupsPageProps {
  params: Promise<{ id: string }>
}

function mapPrismaCluster(row: {
  id: number
  name: string
  brokers: string
  authType: string
  authConfig: unknown
  schemaRegistryUrl: string | null
  description: string | null
  createdAt: Date
  updatedAt: Date
}): Cluster {
  return {
    id: row.id,
    name: row.name,
    brokers: row.brokers,
    auth_type: row.authType as Cluster["auth_type"],
    auth_config:
      typeof row.authConfig === "string"
        ? row.authConfig
        : JSON.stringify(row.authConfig ?? {}),
    schema_registry_url: row.schemaRegistryUrl,
    description: row.description,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export default async function ConsumerGroupsPage({
  params,
}: ConsumerGroupsPageProps) {
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) notFound()

  let row: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
  try {
    row = await prisma.cluster.findUnique({ where: { id } })
  } catch {
    throw new Error("Failed to fetch cluster from database")
  }

  if (!row) notFound()

  const cluster = mapPrismaCluster(row)

  return <ConsumerGroupsClient cluster={cluster} />
}
