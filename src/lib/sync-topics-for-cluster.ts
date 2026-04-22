import { prisma } from "@/lib/db"
import { createKafkaClient } from "@/lib/kafka"
import { Cluster } from "@/types"
import { TopicSummary } from "@/app/api/clusters/[id]/topics/route"

const TIMEOUT_MS = 15_000
// KafkaJS admin is not safe for concurrent fetchTopicOffsets calls on the same
// instance — internal request tracking gets confused. Sequential (1 at a time)
// is reliable because the connection stays open between calls.
const OFFSET_BATCH_SIZE = 1
// Shorter per-fetch timeout so a stalled topic fails fast and doesn't block the rest.
const OFFSET_TIMEOUT_MS = 8_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, r) =>
      setTimeout(() => r(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ])
}

// Run fn over items with at most `concurrency` in-flight at once.
// Returns results in the same order as items, matching Promise.allSettled shape.
async function batchSettled<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(batch.map(fn))
    batchResults.forEach((r, j) => { results[i + j] = r })
  }
  return results
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

export interface SyncTopicsResult {
  topics: TopicSummary[]
  syncedAt: string
}

// ---------------------------------------------------------------------------
// Core sync logic — used by the API route and the daily cron job.
// ---------------------------------------------------------------------------

export async function syncTopicsForCluster(clusterId: number): Promise<SyncTopicsResult> {
  const row = await prisma.cluster.findUnique({ where: { id: clusterId } })
  if (!row) throw new Error(`Cluster ${clusterId} not found`)

  const cluster = mapPrismaCluster(row)
  const kafka = createKafkaClient(cluster)
  const admin = kafka.admin()

  try {
    await withTimeout(admin.connect(), TIMEOUT_MS)

    const allNames = await withTimeout(admin.listTopics(), TIMEOUT_MS)

    if (allNames.length === 0) {
      await prisma.topic.deleteMany({ where: { clusterId } })
      return { topics: [], syncedAt: new Date().toISOString() }
    }

    const metadata = await withTimeout(
      admin.fetchTopicMetadata({ topics: allNames }),
      TIMEOUT_MS
    )

    const syncedAt = new Date()

    // Fetch offsets in batches to avoid overwhelming the broker with concurrent requests
    const offsetResults = await batchSettled(
      allNames,
      OFFSET_BATCH_SIZE,
      (name) =>
        withTimeout(admin.fetchTopicOffsets(name), OFFSET_TIMEOUT_MS).then(
          (offsets) => ({ name, offsets })
        )
    )

    const messageCountMap = new Map<string, { count: number; failed: boolean }>()
    for (const result of offsetResults) {
      if (result.status === "fulfilled") {
        const { name, offsets } = result.value
        const count = offsets.reduce((sum, o) => {
          const high = parseInt((o as unknown as { high: string }).high ?? o.offset, 10)
          const low = parseInt((o as unknown as { low: string }).low ?? "0", 10)
          return sum + Math.max(0, high - low)
        }, 0)
        messageCountMap.set(name, { count, failed: false })
      } else {
        const name = allNames[offsetResults.indexOf(result)]
        messageCountMap.set(name, { count: 0, failed: true })
      }
    }

    // Upsert topics
    await Promise.all(
      metadata.topics.map((topic) => {
        const partitionCount = topic.partitions.length
        const replicationFactor = topic.partitions[0]?.replicas?.length ?? 0
        const hasUnderReplicatedPartitions = topic.partitions.some(
          (p) => p.isr.length < p.replicas.length
        )
        const isInternal = topic.name.startsWith("__")
        const { count: totalMessageCount, failed: messageCountSyncFailed } =
          messageCountMap.get(topic.name) ?? { count: 0, failed: false }

        return prisma.topic.upsert({
          where: { clusterId_name: { clusterId, name: topic.name } },
          create: {
            clusterId,
            name: topic.name,
            isInternal,
            partitionCount,
            replicationFactor,
            hasUnderReplicatedPartitions,
            totalMessageCount,
            messageCountSyncFailed,
            syncedAt,
          },
          update: {
            isInternal,
            partitionCount,
            replicationFactor,
            hasUnderReplicatedPartitions,
            totalMessageCount,
            messageCountSyncFailed,
            syncedAt,
          },
        })
      })
    )

    // Write daily snapshots for topics whose count succeeded
    const today = new Date(syncedAt)
    today.setUTCHours(0, 0, 0, 0)

    await Promise.allSettled(
      metadata.topics
        .filter((t) => !(messageCountMap.get(t.name)?.failed))
        .map((t) => {
          const { count } = messageCountMap.get(t.name) ?? { count: 0 }
          return prisma.topicDailySnapshot.upsert({
            where: {
              clusterId_topicName_snapshotDate: {
                clusterId,
                topicName: t.name,
                snapshotDate: today,
              },
            },
            create: { clusterId, topicName: t.name, snapshotDate: today, messageCount: count },
            update: { messageCount: count, recordedAt: syncedAt },
          })
        })
    )

    // Remove stale topics
    const kafkaNames = new Set(metadata.topics.map((t) => t.name))
    await prisma.topic.deleteMany({
      where: { clusterId, name: { notIn: Array.from(kafkaNames) } },
    })

    // Return refreshed list
    const rows = await prisma.topic.findMany({
      where: { clusterId },
      orderBy: [{ isInternal: "asc" }, { name: "asc" }],
    })

    return {
      topics: rows.map((r) => ({
        name: r.name,
        isInternal: r.isInternal,
        partitionCount: r.partitionCount,
        replicationFactor: r.replicationFactor,
        hasUnderReplicatedPartitions: r.hasUnderReplicatedPartitions,
        totalMessageCount: r.totalMessageCount,
        messageCountSyncFailed: r.messageCountSyncFailed,
      })),
      syncedAt: syncedAt.toISOString(),
    }
  } finally {
    try {
      await admin.disconnect()
    } catch {
      // ignore disconnect errors
    }
  }
}
