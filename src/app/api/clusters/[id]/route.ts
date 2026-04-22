import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Cluster, ApiResponse } from "@/types"

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
    auth_config: typeof row.authConfig === "string"
      ? row.authConfig
      : JSON.stringify(row.authConfig ?? {}),
    schema_registry_url: row.schemaRegistryUrl,
    description: row.description,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<ApiResponse<Cluster>>> {
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json({ success: false, error: "Invalid cluster id" }, { status: 400 })
  }

  try {
    const row = await prisma.cluster.findUnique({ where: { id } })
    if (!row) {
      return NextResponse.json({ success: false, error: "Cluster not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: mapPrismaCluster(row) })
  } catch (err) {
    console.error("[GET /api/clusters/[id]]", err)
    return NextResponse.json({ success: false, error: "Failed to fetch cluster" }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT /api/clusters/[id] — disabled (admin-only, re-enable when role auth is added)
// ---------------------------------------------------------------------------
// export async function PUT(
//   req: NextRequest,
//   { params }: RouteContext
// ): Promise<NextResponse<ApiResponse<Cluster>>> {
//   const { id: idStr } = await params
//   const id = parseInt(idStr, 10)
//   if (isNaN(id)) {
//     return NextResponse.json({ success: false, error: "Invalid cluster id" }, { status: 400 })
//   }
//
//   const clusterUpdateSchema = z.object({
//     name: z.string().min(1).optional(),
//     brokers: z.string().min(1).optional(),
//     auth_type: z.enum(["none", "sasl_plain", "sasl_scram_256", "sasl_scram_512", "ssl"]).optional(),
//     auth_config: z.record(z.unknown()).optional(),
//     schema_registry_url: z.string().url().optional().nullable().or(z.literal("")),
//     description: z.string().optional().nullable(),
//   })
//
//   try {
//     const body = await req.json()
//     const parsed = clusterUpdateSchema.safeParse(body)
//     if (!parsed.success) {
//       return NextResponse.json(
//         { success: false, error: "Validation failed", details: parsed.error.flatten() },
//         { status: 400 }
//       )
//     }
//
//     const { name, brokers, auth_type, auth_config, schema_registry_url, description } = parsed.data
//
//     const updateData: Record<string, unknown> = {}
//     if (name !== undefined) updateData.name = name
//     if (brokers !== undefined) updateData.brokers = brokers
//     if (auth_type !== undefined) updateData.authType = auth_type
//     if (auth_config !== undefined) updateData.authConfig = auth_config
//     if (schema_registry_url !== undefined) updateData.schemaRegistryUrl = schema_registry_url || null
//     if (description !== undefined) updateData.description = description || null
//
//     const row = await prisma.cluster.update({ where: { id }, data: updateData })
//     return NextResponse.json({ success: true, data: mapPrismaCluster(row) })
//   } catch (err: unknown) {
//     if (
//       typeof err === "object" &&
//       err !== null &&
//       "code" in err &&
//       (err as { code: string }).code === "P2025"
//     ) {
//       return NextResponse.json({ success: false, error: "Cluster not found" }, { status: 404 })
//     }
//     console.error("[PUT /api/clusters/[id]]", err)
//     return NextResponse.json({ success: false, error: "Failed to update cluster" }, { status: 500 })
//   }
// }

// ---------------------------------------------------------------------------
// DELETE /api/clusters/[id] — disabled (admin-only, re-enable when role auth is added)
// ---------------------------------------------------------------------------
// export async function DELETE(
//   _req: NextRequest,
//   { params }: RouteContext
// ): Promise<NextResponse<ApiResponse<{ id: number }>>> {
//   const { id: idStr } = await params
//   const id = parseInt(idStr, 10)
//   if (isNaN(id)) {
//     return NextResponse.json({ success: false, error: "Invalid cluster id" }, { status: 400 })
//   }
//
//   try {
//     await prisma.cluster.delete({ where: { id } })
//     return NextResponse.json({ success: true, data: { id } })
//   } catch (err: unknown) {
//     if (
//       typeof err === "object" &&
//       err !== null &&
//       "code" in err &&
//       (err as { code: string }).code === "P2025"
//     ) {
//       return NextResponse.json({ success: false, error: "Cluster not found" }, { status: 404 })
//     }
//     console.error("[DELETE /api/clusters/[id]]", err)
//     return NextResponse.json({ success: false, error: "Failed to delete cluster" }, { status: 500 })
//   }
// }
