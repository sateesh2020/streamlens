import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { ApiResponse } from "@/types"

export interface SubjectSummary {
  subject: string
  schemaType: string
  versionCount: number
  latestVersion: number
  compatibility: string
}

export interface SubjectsListResponse {
  subjects: SubjectSummary[]
  syncedAt: string | null
  schemaRegistryUrl: string
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<ApiResponse<SubjectsListResponse>>> {
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json({ success: false, error: "Invalid cluster id" }, { status: 400 })
  }

  let cluster: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
  try {
    cluster = await prisma.cluster.findUnique({ where: { id } })
  } catch (err) {
    console.error("[GET /schema-registry/subjects] db error", err)
    return NextResponse.json({ success: false, error: "Failed to fetch cluster" }, { status: 500 })
  }

  if (!cluster) {
    return NextResponse.json({ success: false, error: "Cluster not found" }, { status: 404 })
  }

  if (!cluster.schemaRegistryUrl) {
    return NextResponse.json({
      success: true,
      data: { subjects: [], syncedAt: null, schemaRegistryUrl: "" },
    })
  }

  try {
    const rows = await prisma.schemaSubject.findMany({
      where: { clusterId: id },
      orderBy: { subject: "asc" },
    })

    const syncedAt =
      rows.length > 0
        ? rows.reduce((latest, r) =>
            r.syncedAt > latest.syncedAt ? r : latest
          ).syncedAt.toISOString()
        : null

    const subjects: SubjectSummary[] = rows.map((r) => ({
      subject: r.subject,
      schemaType: r.schemaType,
      versionCount: r.versionCount,
      latestVersion: r.latestVersion,
      compatibility: r.compatibility,
    }))

    return NextResponse.json({
      success: true,
      data: { subjects, syncedAt, schemaRegistryUrl: cluster.schemaRegistryUrl },
    })
  } catch (err) {
    console.error("[GET /schema-registry/subjects] db error", err)
    return NextResponse.json({ success: false, error: "Failed to fetch subjects" }, { status: 500 })
  }
}
