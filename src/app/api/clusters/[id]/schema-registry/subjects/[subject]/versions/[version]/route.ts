import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { ApiResponse } from "@/types"

export interface SchemaVersionDetail {
  subject: string
  version: number
  schemaId: number
  schemaType: string
  schema: string
}

type RouteContext = {
  params: Promise<{ id: string; subject: string; version: string }>
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<ApiResponse<SchemaVersionDetail>>> {
  const { id: idStr, subject: encodedSubject, version } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json({ success: false, error: "Invalid cluster id" }, { status: 400 })
  }

  const subject = decodeURIComponent(encodedSubject)
  if (!subject) {
    return NextResponse.json({ success: false, error: "Subject is required" }, { status: 400 })
  }

  let cluster: Awaited<ReturnType<typeof prisma.cluster.findUnique>>
  try {
    cluster = await prisma.cluster.findUnique({ where: { id } })
  } catch (err) {
    console.error("[GET /schema-registry/.../versions/[version]] db error", err)
    return NextResponse.json({ success: false, error: "Failed to fetch cluster" }, { status: 500 })
  }

  if (!cluster) {
    return NextResponse.json({ success: false, error: "Cluster not found" }, { status: 404 })
  }

  if (!cluster.schemaRegistryUrl) {
    return NextResponse.json(
      { success: false, error: "No Schema Registry URL configured for this cluster" },
      { status: 400 }
    )
  }

  const baseUrl = cluster.schemaRegistryUrl.replace(/\/$/, "")
  const versionStr = version === "latest" ? "latest" : version

  try {
    const res = await fetch(
      `${baseUrl}/subjects/${encodeURIComponent(subject)}/versions/${versionStr}`
    )
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Registry returned ${res.status}` },
        { status: res.status >= 400 && res.status < 500 ? 404 : 502 }
      )
    }

    const data = await res.json()

    return NextResponse.json({
      success: true,
      data: {
        subject: data.subject as string,
        version: data.version as number,
        schemaId: data.id as number,
        schemaType: (data.schemaType as string | undefined) ?? "AVRO",
        schema: data.schema as string,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[GET /schema-registry/.../versions/[version]] fetch error", err)
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}
