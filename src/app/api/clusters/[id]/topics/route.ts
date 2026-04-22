import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { ApiResponse } from "@/types"

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface TopicSummary {
  name: string
  isInternal: boolean
  partitionCount: number
  replicationFactor: number
  hasUnderReplicatedPartitions: boolean
  totalMessageCount: number
  messageCountSyncFailed: boolean
}

export interface TopicsListResponse {
  topics: TopicSummary[]
  syncedAt: string | null
}

type RouteContext = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// GET /api/clusters/[id]/topics  — reads from DB cache
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<ApiResponse<TopicsListResponse>>> {
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid cluster id" },
      { status: 400 }
    )
  }

  const includeInternal =
    req.nextUrl.searchParams.get("includeInternal") === "true"

  try {
    const rows = await prisma.topic.findMany({
      where: {
        clusterId: id,
        ...(includeInternal ? {} : { isInternal: false }),
      },
      orderBy: [{ isInternal: "asc" }, { name: "asc" }],
    })

    const syncedAt =
      rows.length > 0
        ? rows.reduce((latest, r) =>
            r.syncedAt > latest.syncedAt ? r : latest
          ).syncedAt.toISOString()
        : null

    const topics: TopicSummary[] = rows.map((r) => ({
      name: r.name,
      isInternal: r.isInternal,
      partitionCount: r.partitionCount,
      replicationFactor: r.replicationFactor,
      hasUnderReplicatedPartitions: r.hasUnderReplicatedPartitions,
      totalMessageCount: r.totalMessageCount,
      messageCountSyncFailed: r.messageCountSyncFailed,
    }))

    return NextResponse.json({ success: true, data: { topics, syncedAt } })
  } catch (err) {
    console.error("[GET /api/clusters/[id]/topics] db error", err)
    return NextResponse.json(
      { success: false, error: "Failed to fetch topics from database" },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/clusters/[id]/topics — disabled (admin-only, re-enable when role auth is added)
// ---------------------------------------------------------------------------
// const createTopicSchema = z.object({
//   name: z
//     .string()
//     .min(1, "Topic name is required")
//     .regex(/^[a-zA-Z0-9._-]+$/, "Topic name may only contain letters, digits, '.', '_', or '-'"),
//   numPartitions: z.number().int().min(1).max(100),
//   replicationFactor: z.number().int().min(1).max(10),
// })
//
// export async function POST(
//   req: NextRequest,
//   { params }: RouteContext
// ): Promise<NextResponse<ApiResponse<{ name: string }>>> {
//   const { id: idStr } = await params
//   const id = parseInt(idStr, 10)
//   if (isNaN(id)) {
//     return NextResponse.json(
//       { success: false, error: "Invalid cluster id" },
//       { status: 400 }
//     )
//   }
//
//   let body: unknown
//   try {
//     body = await req.json()
//   } catch {
//     return NextResponse.json(
//       { success: false, error: "Invalid JSON body" },
//       { status: 400 }
//     )
//   }
//
//   const parsed = createTopicSchema.safeParse(body)
//   if (!parsed.success) {
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Validation failed",
//         details: parsed.error.flatten(),
//       },
//       { status: 400 }
//     )
//   }
//
//   const { name, numPartitions, replicationFactor } = parsed.data
//
//   let row: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
//   try {
//     row = await prisma.cluster.findUnique({ where: { id } })
//   } catch (err) {
//     console.error("[POST /api/clusters/[id]/topics] db error", err)
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
//       admin.createTopics({
//         topics: [{ topic: name, numPartitions, replicationFactor }],
//       }),
//       TIMEOUT_MS
//     )
//
//     // Save to DB cache
//     await prisma.topic.upsert({
//       where: { clusterId_name: { clusterId: id, name } },
//       create: {
//         clusterId: id,
//         name,
//         isInternal: false,
//         partitionCount: numPartitions,
//         replicationFactor,
//         hasUnderReplicatedPartitions: false,
//         syncedAt: new Date(),
//       },
//       update: {
//         partitionCount: numPartitions,
//         replicationFactor,
//         syncedAt: new Date(),
//       },
//     })
//
//     return NextResponse.json({ success: true, data: { name } }, { status: 201 })
//   } catch (err: unknown) {
//     const message = err instanceof Error ? err.message : "Unknown error"
//     console.error("[POST /api/clusters/[id]/topics] kafka error", err)
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
