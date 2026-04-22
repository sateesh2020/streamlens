import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { ApiResponse } from "@/types"

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface TopicSnapshot {
  date: string        // YYYY-MM-DD
  messageCount: number
  recordedAt: string  // ISO timestamp of the sync that wrote this row
}

export interface TopicHistory {
  topicName: string
  snapshots: TopicSnapshot[]
}

export interface TopicsHistoryResponse {
  history: TopicHistory[]
  from: string  // YYYY-MM-DD, inclusive
  to: string    // YYYY-MM-DD, inclusive
}

// ---------------------------------------------------------------------------
// GET /api/clusters/[id]/topics/history
//
// Query params:
//   days    number  how many days back to fetch (default 30, max 365)
//   topic   string  filter to a single topic name (optional)
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<ApiResponse<TopicsHistoryResponse>>> {
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json({ success: false, error: "Invalid cluster id" }, { status: 400 })
  }

  const sp = req.nextUrl.searchParams
  const days = Math.min(365, Math.max(1, parseInt(sp.get("days") ?? "30", 10) || 30))
  const topicFilter = sp.get("topic") ?? null

  // Compute the start-of-day UTC boundary
  const toDate = new Date()
  toDate.setUTCHours(0, 0, 0, 0)
  const fromDate = new Date(toDate)
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1))

  try {
    const rows = await prisma.topicDailySnapshot.findMany({
      where: {
        clusterId: id,
        snapshotDate: { gte: fromDate, lte: toDate },
        ...(topicFilter ? { topicName: topicFilter } : {}),
      },
      orderBy: [{ topicName: "asc" }, { snapshotDate: "asc" }],
    })

    // Group by topic name
    const grouped = new Map<string, TopicSnapshot[]>()
    for (const row of rows) {
      const dateStr = row.snapshotDate.toISOString().slice(0, 10)
      if (!grouped.has(row.topicName)) grouped.set(row.topicName, [])
      grouped.get(row.topicName)!.push({
        date: dateStr,
        messageCount: row.messageCount,
        recordedAt: row.recordedAt.toISOString(),
      })
    }

    const history: TopicHistory[] = Array.from(grouped.entries()).map(
      ([topicName, snapshots]) => ({ topicName, snapshots })
    )

    return NextResponse.json({
      success: true,
      data: {
        history,
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
      },
    })
  } catch (err) {
    console.error("[GET /api/clusters/[id]/topics/history] db error", err)
    return NextResponse.json(
      { success: false, error: "Failed to fetch topic history" },
      { status: 500 }
    )
  }
}
