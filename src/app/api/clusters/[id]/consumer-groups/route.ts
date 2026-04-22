import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createKafkaClient } from "@/lib/kafka"
import { Cluster, ApiResponse } from "@/types"

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface ConsumerGroupSummary {
  groupId: string
  state: string
  memberCount: number
  totalLag: number
  topicCount: number
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
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ])
}

type RouteContext = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// GET /api/clusters/[id]/consumer-groups
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<ApiResponse<ConsumerGroupSummary[]>>> {
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
    console.error("[GET /api/clusters/[id]/consumer-groups] db error", err)
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

    // 2. List all groups
    const listResult = await withTimeout(admin.listGroups(), TIMEOUT_MS)
    const groupIds = listResult.groups.map((g) => g.groupId)

    if (groupIds.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    // 3. Describe groups → state, memberCount
    const described = await withTimeout(
      admin.describeGroups(groupIds),
      TIMEOUT_MS
    )

    // Build a map: groupId → { state, memberCount }
    const groupMeta = new Map<string, { state: string; memberCount: number }>()
    for (const g of described.groups) {
      groupMeta.set(g.groupId, {
        state: g.state,
        memberCount: g.members.length,
      })
    }

    // 4. For each group, fetch committed offsets
    // We fetch them sequentially to avoid overwhelming the broker, but gather
    // all the topic names we need so we can deduplicate fetchTopicOffsets calls.
    const groupOffsets = await Promise.all(
      groupIds.map((groupId) =>
        withTimeout(admin.fetchOffsets({ groupId }), TIMEOUT_MS).then(
          (offsets) => ({ groupId, offsets })
        )
      )
    )

    // 5. Collect unique topic names across all groups
    const uniqueTopics = new Set<string>()
    for (const { offsets } of groupOffsets) {
      for (const entry of offsets) {
        uniqueTopics.add(entry.topic)
      }
    }

    // 6. Fetch latest (high-watermark) offsets for each unique topic — deduplicated
    const topicLatestOffsets = new Map<
      string,
      Map<number, bigint> // partition → latestOffset
    >()

    await Promise.all(
      Array.from(uniqueTopics).map(async (topic) => {
        try {
          const partitionOffsets = await withTimeout(
            admin.fetchTopicOffsets(topic),
            TIMEOUT_MS
          )
          const partitionMap = new Map<number, bigint>()
          for (const po of partitionOffsets) {
            // KafkaJS returns `high` as the latest (end) offset
            partitionMap.set(po.partition, BigInt(po.high))
          }
          topicLatestOffsets.set(topic, partitionMap)
        } catch {
          // If we can't fetch offsets for a topic, skip it (topic may be deleted)
          topicLatestOffsets.set(topic, new Map())
        }
      })
    )

    // 7. Compute lag per group
    const summaries: ConsumerGroupSummary[] = groupIds.map((groupId) => {
      const meta = groupMeta.get(groupId) ?? { state: "Unknown", memberCount: 0 }
      const groupData = groupOffsets.find((g) => g.groupId === groupId)
      const offsets = groupData?.offsets ?? []

      let totalLag = 0
      const topicsInGroup = new Set<string>()

      for (const entry of offsets) {
        topicsInGroup.add(entry.topic)
        const partitionMap = topicLatestOffsets.get(entry.topic)
        if (!partitionMap) continue

        for (const partitionOffset of entry.partitions) {
          const latestOffset = partitionMap.get(partitionOffset.partition)
          if (latestOffset === undefined) continue

          const committed = BigInt(partitionOffset.offset)
          const lag = latestOffset - committed
          // Cap at 0 — consumer may be ahead due to compaction or resets
          totalLag += Number(lag < BigInt(0) ? BigInt(0) : lag)
        }
      }

      return {
        groupId,
        state: meta.state,
        memberCount: meta.memberCount,
        totalLag,
        topicCount: topicsInGroup.size,
      }
    })

    // Sort: stable groups first, then alphabetically by groupId
    summaries.sort((a, b) => {
      if (a.state !== b.state) {
        if (a.state === "Stable") return -1
        if (b.state === "Stable") return 1
      }
      return a.groupId.localeCompare(b.groupId)
    })

    return NextResponse.json({ success: true, data: summaries })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[GET /api/clusters/[id]/consumer-groups] kafka error", err)
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
