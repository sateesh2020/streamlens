import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { createKafkaClient } from "@/lib/kafka"
import { Cluster, MessageRecord, ApiResponse } from "@/types"

// ---------------------------------------------------------------------------
// Query-param schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  partition: z
    .string()
    .default("all")
    .refine((v) => v === "all" || /^\d+$/.test(v), {
      message: "partition must be 'all' or a non-negative integer",
    }),
  offset: z
    .string()
    .default("latest")
    .refine((v) => v === "earliest" || v === "latest" || /^\d+$/.test(v), {
      message:
        "offset must be 'earliest', 'latest', or a non-negative integer string",
    }),
  limit: z
    .string()
    .default("50")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(500)),
  fromTimestamp: z.string().optional(),
})

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

const ADMIN_TIMEOUT_MS = 15_000
const CONSUME_TIMEOUT_MS = 30_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ])
}

/** Decode a KafkaJS Buffer/string header value to a plain string. */
function decodeHeaderValue(val: Buffer | string | undefined | null): string {
  if (val == null) return ""
  if (Buffer.isBuffer(val)) return val.toString("utf8")
  return String(val)
}

/** Try JSON.parse + pretty-print; return original string on parse failure. */
function tryParseJson(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return raw
  }
}

// ---------------------------------------------------------------------------
// Route context
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string; topic: string }> }

// ---------------------------------------------------------------------------
// GET /api/clusters/[id]/topics/[topic]/messages
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: RouteContext
): Promise<
  NextResponse<ApiResponse<{ messages: MessageRecord[]; hasMore: boolean }>>
> {
  // 1. Parse & validate cluster id
  const { id: idStr, topic } = await params
  const clusterId = parseInt(idStr, 10)
  if (isNaN(clusterId)) {
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

  // 2. Parse & validate query params
  const sp = req.nextUrl.searchParams
  const rawParams = {
    partition: sp.get("partition") ?? undefined,
    offset: sp.get("offset") ?? undefined,
    limit: sp.get("limit") ?? undefined,
    fromTimestamp: sp.get("fromTimestamp") ?? undefined,
  }

  const parsed = querySchema.safeParse(rawParams)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid query parameters",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    )
  }

  const {
    partition: partitionParam,
    offset: offsetParam,
    limit,
    fromTimestamp,
  } = parsed.data

  // 3. Fetch cluster from DB
  let row: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
  try {
    row = await prisma.cluster.findUnique({ where: { id: clusterId } })
  } catch (err) {
    console.error("[GET messages] db error", err)
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

  // 4. Use admin to resolve partition list and offsets
  const admin = kafka.admin()
  let partitions: number[]

  // Maps partition → { earliest: string, latest: string } (as numeric strings)
  const offsetMap = new Map<number, { earliest: string; latest: string }>()

  try {
    await withTimeout(admin.connect(), ADMIN_TIMEOUT_MS)

    // Discover partition list
    if (partitionParam === "all") {
      const metadata = await withTimeout(
        admin.fetchTopicMetadata({ topics: [topicName] }),
        ADMIN_TIMEOUT_MS
      )
      const topicMeta = metadata.topics[0]
      if (!topicMeta) {
        return NextResponse.json(
          { success: false, error: "Topic not found" },
          { status: 404 }
        )
      }
      partitions = topicMeta.partitions
        .map((p) => p.partitionId)
        .sort((a, b) => a - b)
    } else {
      partitions = [parseInt(partitionParam, 10)]
    }

    // Fetch high/low water marks for all partitions
    const topicOffsets = await withTimeout(
      admin.fetchTopicOffsets(topicName),
      ADMIN_TIMEOUT_MS
    )
    for (const o of topicOffsets) {
      offsetMap.set(o.partition, {
        earliest: (o as unknown as { low: string }).low ?? "0",
        latest: o.offset,
      })
    }

    // If fromTimestamp is provided, override start offsets per partition
    if (fromTimestamp) {
      try {
        const ts = new Date(fromTimestamp).getTime()
        if (!isNaN(ts)) {
          const tsOffsets = await withTimeout(
            admin.fetchTopicOffsetsByTimestamp(topicName, ts),
            ADMIN_TIMEOUT_MS
          )
          for (const o of tsOffsets) {
            const existing = offsetMap.get(o.partition)
            if (existing) {
              const tsOff = parseInt(o.offset, 10)
              if (!isNaN(tsOff) && tsOff >= 0) {
                offsetMap.set(o.partition, {
                  earliest: String(tsOff),
                  latest: existing.latest,
                })
              }
            }
          }
        }
      } catch (tsErr) {
        console.warn(
          "[GET messages] timestamp offset resolution failed — ignoring",
          tsErr
        )
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[GET messages] admin error", err)
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 }
    )
  } finally {
    try {
      await admin.disconnect()
    } catch {
      /* ignore */
    }
  }

  // 5. Compute per-partition seek targets
  // Spread limit evenly across partitions; use full limit for single-partition.
  const perPartitionLimit = Math.max(1, Math.ceil(limit / partitions.length))

  // seekMap: partition → offset string to seek to
  const seekMap = new Map<number, string>()

  for (const partId of partitions) {
    const offsets = offsetMap.get(partId)
    const latestStr = offsets?.latest ?? "0"
    const earliestStr = offsets?.earliest ?? "0"
    const latest = parseInt(latestStr, 10)
    const earliest = parseInt(earliestStr, 10)

    // Empty partition (latest <= earliest) — nothing to read
    if (latest <= earliest) continue

    let seekOffset: number

    if (offsetParam === "earliest") {
      seekOffset = earliest
    } else if (offsetParam === "latest") {
      seekOffset = latest - perPartitionLimit
      if (seekOffset < earliest) seekOffset = earliest
    } else {
      seekOffset = parseInt(offsetParam, 10)
      if (seekOffset < earliest) seekOffset = earliest
    }

    // Skip if the target offset is already at or past the latest
    if (seekOffset >= latest) continue

    seekMap.set(partId, String(seekOffset))
  }

  // Nothing to consume — return empty result immediately
  if (seekMap.size === 0) {
    return NextResponse.json({
      success: true,
      data: { messages: [], hasMore: false },
    })
  }

  // 6. Consume messages using a unique ephemeral browse group
  const groupId = `streamlens-browse-${randomUUID()}`
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
  })

  const collectedMessages: MessageRecord[] = []
  const partitionCounts = new Map<number, number>()

  try {
    await withTimeout(consumer.connect(), ADMIN_TIMEOUT_MS)

    // Subscribe from the beginning so KafkaJS lets us seek freely
    await consumer.subscribe({ topic: topicName, fromBeginning: true })

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          consumer.stop().then(resolve).catch(resolve)
        }, CONSUME_TIMEOUT_MS)

        // run() must be called before seek() — KafkaJS requires the consumer
        // group to be initialized first. Seeks are queued and applied before
        // the first fetch of each partition.
        consumer
          .run({
            eachMessage: async ({ partition, message }) => {
              // Only process partitions we care about
              if (!seekMap.has(partition)) return

              const partCount = partitionCounts.get(partition) ?? 0
              if (partCount >= perPartitionLimit) return

              // Decode key
              const keyRaw = message.key
              const key =
                keyRaw != null && keyRaw.length > 0
                  ? keyRaw.toString("utf8")
                  : null

              // Decode value (pretty-print JSON if parseable)
              const valueRaw = message.value
              let value: string | null = null
              if (valueRaw != null && valueRaw.length > 0) {
                value = tryParseJson(valueRaw.toString("utf8"))
              }

              // Decode headers
              const headers: Record<string, string> = {}
              if (message.headers) {
                for (const [k, v] of Object.entries(message.headers)) {
                  headers[k] = decodeHeaderValue(
                    v as Buffer | string | undefined | null
                  )
                }
              }

              // Size estimate (bytes)
              const size =
                (message.key?.length ?? 0) +
                (message.value?.length ?? 0) +
                Object.entries(headers).reduce(
                  (acc, [k, v]) => acc + k.length + v.length,
                  0
                )

              collectedMessages.push({
                topic: topicName,
                partition,
                offset: message.offset,
                timestamp: message.timestamp,
                key,
                value,
                headers,
                size,
              })

              partitionCounts.set(partition, partCount + 1)

              // Stop once we've hit the total limit
              if (collectedMessages.length >= limit) {
                clearTimeout(timeout)
                consumer.stop().then(resolve).catch(resolve)
              }
            },
          })
          .catch((err: unknown) => {
            clearTimeout(timeout)
            reject(err instanceof Error ? err : new Error(String(err)))
          })

        // Seek after run() so the consumer group is initialized
        for (const [partId, seekOffset] of seekMap.entries()) {
          consumer.seek({ topic: topicName, partition: partId, offset: seekOffset })
        }
      }),
      CONSUME_TIMEOUT_MS + 5_000 // outer hard limit
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[GET messages] consumer error", err)
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 }
    )
  } finally {
    try {
      await consumer.disconnect()
    } catch {
      /* ignore disconnect errors */
    }
  }

  // 7. Sort by partition asc, then offset asc
  collectedMessages.sort((a, b) => {
    if (a.partition !== b.partition) return a.partition - b.partition
    return parseInt(a.offset, 10) - parseInt(b.offset, 10)
  })

  const hasMore = collectedMessages.length >= limit

  return NextResponse.json({
    success: true,
    data: { messages: collectedMessages, hasMore },
  })
}
