import { NextRequest, NextResponse } from "next/server"
import { ApiResponse } from "@/types"
import { TopicsListResponse } from "../route"
import { syncTopicsForCluster } from "@/lib/sync-topics-for-cluster"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(
  _req: NextRequest,
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

  try {
    const result = await syncTopicsForCluster(id)
    return NextResponse.json({ success: true, data: result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[POST /api/clusters/[id]/topics/sync]", err)
    return NextResponse.json(
      { success: false, error: message },
      { status: err instanceof Error && err.message.includes("not found") ? 404 : 502 }
    )
  }
}
