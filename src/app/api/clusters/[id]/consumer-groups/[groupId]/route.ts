import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createKafkaClient } from "@/lib/kafka"
import { Cluster, ApiResponse } from "@/types"

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface ConsumerGroupMemberDetail {
  memberId: string
  clientId: string
  clientHost: string
  assignedTopicPartitions: Array<{ topic: string; partitions: number[] }>
}

export interface ConsumerGroupOffsetRow {
  topic: string
  partition: number
  committedOffset: string
  latestOffset: string
  lag: number
}

export interface ConsumerGroupDetail {
  groupId: string
  state: string
  protocol: string
  protocolType: string
  members: ConsumerGroupMemberDetail[]
  offsets: ConsumerGroupOffsetRow[]
  totalLag: number
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

type RouteContext = { params: Promise<{ id: string; groupId: string }> }

// ---------------------------------------------------------------------------
// GET /api/clusters/[id]/consumer-groups/[groupId]
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<ApiResponse<ConsumerGroupDetail>>> {
  const { id: idStr, groupId: groupIdParam } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid cluster id" },
      { status: 400 }
    )
  }

  const groupId = decodeURIComponent(groupIdParam)
  if (!groupId) {
    return NextResponse.json(
      { success: false, error: "Invalid group id" },
      { status: 400 }
    )
  }

  // 1. Fetch cluster from DB
  let row: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
  try {
    row = await prisma.cluster.findUnique({ where: { id } })
  } catch (err) {
    console.error(
      "[GET /api/clusters/[id]/consumer-groups/[groupId]] db error",
      err
    )
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

    // 2. Describe the group → state, protocol, members
    const described = await withTimeout(
      admin.describeGroups([groupId]),
      TIMEOUT_MS
    )

    const groupDesc = described.groups.find((g) => g.groupId === groupId)
    if (!groupDesc) {
      return NextResponse.json(
        { success: false, error: "Consumer group not found" },
        { status: 404 }
      )
    }

    // 3. Build member detail list
    // KafkaJS member assignment is a binary Buffer; parse topic-partition assignments
    const members: ConsumerGroupMemberDetail[] = groupDesc.members.map(
      (m) => {
        let assignedTopicPartitions: Array<{
          topic: string
          partitions: number[]
        }> = []

        try {
          // m.memberAssignment is a Buffer containing a MemberAssignment structure
          // KafkaJS exposes a decoded form when using the admin API — if it is an
          // object, use it; otherwise fall back to an empty assignment list.
          const raw = m.memberAssignment as unknown
          if (
            raw !== null &&
            typeof raw === "object" &&
            "assignment" in raw &&
            Array.isArray((raw as { assignment: unknown }).assignment)
          ) {
            const parsed = raw as {
              assignment: Array<{ topic: string; partitions: number[] }>
            }
            assignedTopicPartitions = parsed.assignment
          }
        } catch {
          // leave empty
        }

        return {
          memberId: m.memberId,
          clientId: m.clientId,
          clientHost: m.clientHost,
          assignedTopicPartitions,
        }
      }
    )

    // 4. Fetch committed offsets for this group
    const fetchedOffsets = await withTimeout(
      admin.fetchOffsets({ groupId }),
      TIMEOUT_MS
    )

    // 5. Collect unique topic names
    const uniqueTopics = new Set<string>()
    for (const entry of fetchedOffsets) {
      uniqueTopics.add(entry.topic)
    }

    // 6. Fetch latest offsets per unique topic (deduplicated)
    const topicLatestOffsets = new Map<string, Map<number, bigint>>()

    await Promise.all(
      Array.from(uniqueTopics).map(async (topic) => {
        try {
          const partitionOffsets = await withTimeout(
            admin.fetchTopicOffsets(topic),
            TIMEOUT_MS
          )
          const partitionMap = new Map<number, bigint>()
          for (const po of partitionOffsets) {
            partitionMap.set(po.partition, BigInt(po.high))
          }
          topicLatestOffsets.set(topic, partitionMap)
        } catch {
          topicLatestOffsets.set(topic, new Map())
        }
      })
    )

    // 7. Compute per-partition offset rows with lag
    const offsetRows: ConsumerGroupOffsetRow[] = []
    let totalLag = 0

    for (const entry of fetchedOffsets) {
      const partitionMap = topicLatestOffsets.get(entry.topic)
      for (const partitionOffset of entry.partitions) {
        const latestBig = partitionMap?.get(partitionOffset.partition)
        const latestStr = latestBig !== undefined ? latestBig.toString() : "0"
        const committed = BigInt(partitionOffset.offset)
        const latest = latestBig ?? BigInt(0)
        const lagBig = latest - committed
        const lag = Number(lagBig < BigInt(0) ? BigInt(0) : lagBig)
        totalLag += lag

        offsetRows.push({
          topic: entry.topic,
          partition: partitionOffset.partition,
          committedOffset: partitionOffset.offset,
          latestOffset: latestStr,
          lag,
        })
      }
    }

    // Sort by lag descending (highest lag first)
    offsetRows.sort((a, b) => b.lag - a.lag)

    const detail: ConsumerGroupDetail = {
      groupId: groupDesc.groupId,
      state: groupDesc.state,
      protocol: groupDesc.protocol ?? "",
      protocolType: groupDesc.protocolType ?? "",
      members,
      offsets: offsetRows,
      totalLag,
    }

    return NextResponse.json({ success: true, data: detail })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error(
      "[GET /api/clusters/[id]/consumer-groups/[groupId]] kafka error",
      err
    )
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
