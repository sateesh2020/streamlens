import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createKafkaClient } from "@/lib/kafka"
import { Cluster, ApiResponse } from "@/types"
import { ConfigResourceTypes } from "kafkajs"

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface TopicPartitionDetail {
  partitionId: number
  leader: number
  replicas: number[]
  isr: number[]
  isUnderReplicated: boolean
  earliestOffset: string
  latestOffset: string
  messageCount: number
}

export interface TopicDetail {
  name: string
  partitions: TopicPartitionDetail[]
  totalMessageCount: number
  replicationFactor: number
  configs: Record<string, string>
}

// ---------------------------------------------------------------------------
// Prisma → Cluster mapper
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
// Helpers
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, r) =>
      setTimeout(() => r(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ])
}

type RouteContext = { params: Promise<{ id: string; topic: string }> }

// ---------------------------------------------------------------------------
// GET /api/clusters/[id]/topics/[topic]
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<ApiResponse<TopicDetail>>> {
  const { id: idStr, topic } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid cluster id" },
      { status: 400 }
    )
  }

  const topicName = decodeURIComponent(topic)
  if (!topicName) {
    return NextResponse.json(
      { success: false, error: "Topic name is required" },
      { status: 400 }
    )
  }

  // 1. Fetch cluster from DB
  let row: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
  try {
    row = await prisma.cluster.findUnique({ where: { id } })
  } catch (err) {
    console.error("[GET /api/clusters/[id]/topics/[topic]] db error", err)
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
    await withTimeout(admin.connect(), TIMEOUT_MS)

    // 2. Fetch partition metadata
    const metadata = await withTimeout(
      admin.fetchTopicMetadata({ topics: [topicName] }),
      TIMEOUT_MS
    )

    const topicMeta = metadata.topics[0]
    if (!topicMeta) {
      return NextResponse.json(
        { success: false, error: "Topic not found" },
        { status: 404 }
      )
    }

    // 3. Fetch offsets — fetchTopicOffsets returns { partition, offset (latest/high), high, low (earliest) }
    const allOffsets = await withTimeout(
      admin.fetchTopicOffsets(topicName),
      TIMEOUT_MS
    )

    // Build a lookup: partition → { earliest, latest }
    const offsetMap = new Map<number, { earliest: string; latest: string }>()
    for (const o of allOffsets) {
      offsetMap.set(o.partition, {
        earliest: (o as unknown as { low: string }).low ?? "0",
        latest: o.offset,
      })
    }

    // 4. Fetch topic configs
    let configs: Record<string, string> = {}
    try {
      const configResult = await withTimeout(
        admin.describeConfigs({
          includeSynonyms: false,
          resources: [
            {
              type: ConfigResourceTypes.TOPIC,
              name: topicName,
            },
          ],
        }),
        TIMEOUT_MS
      )

      const resource = configResult.resources[0]
      if (resource?.configEntries) {
        for (const entry of resource.configEntries) {
          if (entry.configValue !== null && entry.configValue !== undefined) {
            configs[entry.configName] = entry.configValue
          }
        }
      }
    } catch (configErr) {
      // Non-fatal: config fetch failure shouldn't block the whole request
      console.warn(
        "[GET /api/clusters/[id]/topics/[topic]] config fetch failed",
        configErr
      )
    }

    // 5. Assemble partition details
    const partitions: TopicPartitionDetail[] = topicMeta.partitions
      .map((p) => {
        const offsets = offsetMap.get(p.partitionId)
        const earliest = offsets?.earliest ?? "0"
        const latest = offsets?.latest ?? "0"
        const messageCount = Math.max(
          0,
          parseInt(latest, 10) - parseInt(earliest, 10)
        )

        return {
          partitionId: p.partitionId,
          leader: p.leader,
          replicas: p.replicas,
          isr: p.isr,
          isUnderReplicated: p.isr.length < p.replicas.length,
          earliestOffset: earliest,
          latestOffset: latest,
          messageCount,
        }
      })
      .sort((a, b) => a.partitionId - b.partitionId)

    const totalMessageCount = partitions.reduce(
      (sum, p) => sum + p.messageCount,
      0
    )
    const replicationFactor = topicMeta.partitions[0]?.replicas?.length ?? 0

    const detail: TopicDetail = {
      name: topicName,
      partitions,
      totalMessageCount,
      replicationFactor,
      configs,
    }

    return NextResponse.json({ success: true, data: detail })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[GET /api/clusters/[id]/topics/[topic]] kafka error", err)
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

// ---------------------------------------------------------------------------
// DELETE /api/clusters/[id]/topics/[topic] — disabled (admin-only, re-enable when role auth is added)
// ---------------------------------------------------------------------------
// export async function DELETE(
//   _req: NextRequest,
//   { params }: RouteContext
// ): Promise<NextResponse<ApiResponse<{ name: string }>>> {
//   const { id: idStr, topic } = await params
//   const id = parseInt(idStr, 10)
//   if (isNaN(id)) {
//     return NextResponse.json(
//       { success: false, error: "Invalid cluster id" },
//       { status: 400 }
//     )
//   }
//
//   const topicName = decodeURIComponent(topic)
//   if (!topicName) {
//     return NextResponse.json(
//       { success: false, error: "Topic name is required" },
//       { status: 400 }
//     )
//   }
//
//   let row: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
//   try {
//     row = await prisma.cluster.findUnique({ where: { id } })
//   } catch (err) {
//     console.error("[DELETE /api/clusters/[id]/topics/[topic]] db error", err)
//     return NextResponse.json(
//       { success: false, error: "Failed to fetch cluster from database" },
//       { status: 500 }
//     )
//   }
//
//   if (!row) {
//     return NextResponse.json(
//       { success: false, error: "Cluster not found" },
//       { status: 404 }
//     )
//   }
//
//   const cluster = mapPrismaCluster(row)
//   const kafka = createKafkaClient(cluster)
//   const admin = kafka.admin()
//
//   try {
//     await withTimeout(admin.connect(), TIMEOUT_MS)
//
//     await withTimeout(
//       admin.deleteTopics({ topics: [topicName] }),
//       TIMEOUT_MS
//     )
//
//     // Remove from DB cache
//     await prisma.topic.deleteMany({
//       where: { clusterId: id, name: topicName },
//     })
//
//     return NextResponse.json({ success: true, data: { name: topicName } })
//   } catch (err: unknown) {
//     const message = err instanceof Error ? err.message : "Unknown error"
//     console.error("[DELETE /api/clusters/[id]/topics/[topic]] kafka error", err)
//     return NextResponse.json(
//       { success: false, error: message },
//       { status: 502 }
//     )
//   } finally {
//     try {
//       await admin.disconnect()
//     } catch {
//       // ignore disconnect errors
//     }
//   }
// }

// ---------------------------------------------------------------------------
// PATCH /api/clusters/[id]/topics/[topic]
// Re-fetches just the message count for one topic and updates the DB cache.
// ---------------------------------------------------------------------------

export async function PATCH(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<ApiResponse<{ name: string; totalMessageCount: number }>>> {
  const { id: idStr, topic } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid cluster id" },
      { status: 400 }
    )
  }

  const topicName = decodeURIComponent(topic)
  if (!topicName) {
    return NextResponse.json(
      { success: false, error: "Topic name is required" },
      { status: 400 }
    )
  }

  let row: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
  try {
    row = await prisma.cluster.findUnique({ where: { id } })
  } catch (err) {
    console.error("[PATCH /api/clusters/[id]/topics/[topic]] db error", err)
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
    await withTimeout(admin.connect(), TIMEOUT_MS)

    const offsets = await withTimeout(
      admin.fetchTopicOffsets(topicName),
      TIMEOUT_MS
    )

    const totalMessageCount = offsets.reduce((sum, o) => {
      const high = parseInt((o as unknown as { high: string }).high ?? o.offset, 10)
      const low = parseInt((o as unknown as { low: string }).low ?? "0", 10)
      return sum + Math.max(0, high - low)
    }, 0)

    await prisma.topic.updateMany({
      where: { clusterId: id, name: topicName },
      data: { totalMessageCount, messageCountSyncFailed: false },
    })

    return NextResponse.json({ success: true, data: { name: topicName, totalMessageCount } })
  } catch (err: unknown) {
    await prisma.topic.updateMany({
      where: { clusterId: id, name: topicName },
      data: { messageCountSyncFailed: true },
    }).catch(() => {/* ignore secondary failure */})

    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[PATCH /api/clusters/[id]/topics/[topic]] kafka error", err)
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
