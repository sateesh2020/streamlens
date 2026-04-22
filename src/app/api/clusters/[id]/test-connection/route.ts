import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createKafkaClient } from "@/lib/kafka"
import { Cluster } from "@/types"

type RouteContext = { params: Promise<{ id: string }> }

interface TestConnectionSuccess {
  success: true
  data: { brokerCount: number; controllerId: number }
}
interface TestConnectionError {
  success: false
  error: string
}
type TestConnectionResponse = TestConnectionSuccess | TestConnectionError

function mapPrismaToCluster(row: {
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
    auth_config: typeof row.authConfig === "string"
      ? row.authConfig
      : JSON.stringify(row.authConfig ?? {}),
    schema_registry_url: row.schemaRegistryUrl,
    description: row.description,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function POST(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<TestConnectionResponse>> {
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json({ success: false, error: "Invalid cluster id" })
  }

  let row: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
  try {
    row = await prisma.cluster.findUnique({ where: { id } })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to fetch cluster from database" })
  }

  if (!row) {
    return NextResponse.json({ success: false, error: "Cluster not found" })
  }

  const cluster = mapPrismaToCluster(row)
  const kafka = createKafkaClient(cluster)
  const admin = kafka.admin()

  const TIMEOUT_MS = 10_000

  try {
    // Race the connection attempt against a 10-second timeout
    await Promise.race([
      admin.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timed out after 10 seconds")), TIMEOUT_MS)
      ),
    ])

    const clusterInfo = await Promise.race([
      admin.describeCluster(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Describe cluster timed out")), TIMEOUT_MS)
      ),
    ])

    return NextResponse.json({
      success: true,
      data: {
        brokerCount: clusterInfo.brokers.length,
        controllerId: clusterInfo.controller ?? -1,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ success: false, error: message })
  } finally {
    try {
      await admin.disconnect()
    } catch {
      // Ignore disconnect errors
    }
  }
}
