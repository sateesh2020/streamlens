import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createKafkaClient } from "@/lib/kafka"
import { Cluster, ApiResponse } from "@/types"

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface ClusterOverview {
  clusterId: string
  controllerId: number
  brokers: Array<{
    nodeId: number
    host: string
    port: number
    isController: boolean
  }>
  topicCount: number
  partitionCount: number
  consumerGroupCount: number
}

// ---------------------------------------------------------------------------
// Prisma → Cluster mapper (local copy — not exported from routes/route.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// GET /api/clusters/[id]/overview
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> }

const TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out: ${label} (${ms}ms)`)), ms)
    ),
  ])
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<ApiResponse<ClusterOverview>>> {
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid cluster id" },
      { status: 400 }
    )
  }

  // 1. Fetch cluster from DB
  let row: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
  try {
    row = await prisma.cluster.findUnique({ where: { id } })
  } catch (err) {
    console.error("[GET /api/clusters/[id]/overview] db error", err)
    return NextResponse.json(
      { success: false, error: "Failed to fetch cluster from database" },
      { status: 500 }
    )
  }

  if (!row) {
    return NextResponse.json(
      { success: false, error: "Cluster not found" },
      { status: 404 }
    )
  }

  const cluster = mapPrismaCluster(row)
  const kafka = createKafkaClient(cluster)
  const admin = kafka.admin()

  try {
    // 2. Connect
    await withTimeout(admin.connect(), TIMEOUT_MS, "connect")

    // 3. Describe cluster → brokers + controller
    const clusterInfo = await withTimeout(
      admin.describeCluster(),
      TIMEOUT_MS,
      "describeCluster"
    )

    const controllerId = clusterInfo.controller ?? -1

    const brokers = clusterInfo.brokers.map((b) => ({
      nodeId: b.nodeId,
      host: b.host,
      port: b.port,
      isController: b.nodeId === controllerId,
    }))

    // 4. List topics → count + total partitions
    const topicNames = await withTimeout(
      admin.listTopics(),
      TIMEOUT_MS,
      "listTopics"
    )

    let partitionCount = 0
    if (topicNames.length > 0) {
      const topicMetadata = await withTimeout(
        admin.fetchTopicMetadata({ topics: topicNames }),
        TIMEOUT_MS,
        "fetchTopicMetadata"
      )
      for (const topic of topicMetadata.topics) {
        partitionCount += topic.partitions.length
      }
    }

    // 5. List consumer groups → count
    const groupsResult = await withTimeout(
      admin.listGroups(),
      TIMEOUT_MS,
      "listGroups"
    )
    const consumerGroupCount = groupsResult.groups.length

    const overview: ClusterOverview = {
      clusterId: clusterInfo.clusterId ?? String(id),
      controllerId,
      brokers,
      topicCount: topicNames.length,
      partitionCount,
      consumerGroupCount,
    }

    return NextResponse.json({ success: true, data: overview })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[GET /api/clusters/[id]/overview] kafka error", err)
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 }
    )
  } finally {
    try {
      await admin.disconnect()
    } catch {
      // ignore disconnect errors
    }
  }
}
