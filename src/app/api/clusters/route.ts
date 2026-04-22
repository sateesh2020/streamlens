import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { Cluster, ApiResponse } from "@/types"

const clusterCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  brokers: z.string().min(1, "Brokers are required"),
  auth_type: z.enum(["none", "sasl_plain", "sasl_scram_256", "sasl_scram_512", "ssl"]),
  auth_config: z.record(z.unknown()).optional().default({}),
  schema_registry_url: z.string().url().optional().nullable().or(z.literal("")),
  description: z.string().optional().nullable(),
})

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

export async function GET(): Promise<NextResponse<ApiResponse<Cluster[]>>> {
  try {
    const rows = await prisma.cluster.findMany({
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ success: true, data: rows.map(mapPrismaCluster) })
  } catch (err) {
    console.error("[GET /api/clusters]", err)
    return NextResponse.json(
      { success: false, error: "Failed to fetch clusters" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Cluster>>> {
  try {
    const body = await req.json()
    const parsed = clusterCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { name, brokers, auth_type, auth_config, schema_registry_url, description } = parsed.data

    const row = await prisma.cluster.create({
      data: {
        name,
        brokers,
        authType: auth_type,
        authConfig: (auth_config ?? {}) as object,
        schemaRegistryUrl: schema_registry_url || null,
        description: description || null,
      },
    })

    return NextResponse.json({ success: true, data: mapPrismaCluster(row) }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/clusters]", err)
    return NextResponse.json(
      { success: false, error: "Failed to create cluster" },
      { status: 500 }
    )
  }
}
