import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { Cluster } from "@/types"
import { SubjectDetailClient } from "./subject-detail-client"

interface PageProps {
  params: Promise<{ id: string; subject: string }>
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

export default async function SubjectDetailPage({ params }: PageProps) {
  const { id: idStr, subject: encodedSubject } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) notFound()

  let row: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
  try {
    row = await prisma.cluster.findUnique({ where: { id } })
  } catch {
    throw new Error("Failed to fetch cluster from database")
  }

  if (!row) notFound()

  // Look up cached subject info for the summary card
  const subjectName = decodeURIComponent(encodedSubject)
  const cached = await prisma.schemaSubject.findUnique({
    where: { clusterId_subject: { clusterId: id, subject: subjectName } },
  }).catch(() => null)

  return (
    <SubjectDetailClient
      cluster={mapPrismaCluster(row)}
      subjectName={subjectName}
      cached={
        cached
          ? {
              schemaType: cached.schemaType,
              versionCount: cached.versionCount,
              latestVersion: cached.latestVersion,
              compatibility: cached.compatibility,
            }
          : null
      }
    />
  )
}
