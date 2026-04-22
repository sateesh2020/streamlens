import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { ApiResponse } from "@/types"
import { SubjectSummary, SubjectsListResponse } from "../subjects/route"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(
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
    console.error("[POST /schema-registry/sync] db error", err)
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

  try {
    // 1. Get all subject names
    const subjectsRes = await fetch(`${baseUrl}/subjects`)
    if (!subjectsRes.ok) {
      throw new Error(`Schema Registry returned ${subjectsRes.status} for /subjects`)
    }
    const allSubjects: string[] = await subjectsRes.json()

    // 2. Get global compatibility as fallback for subjects without subject-level config
    let globalCompatibility = ""
    try {
      const gc = await fetch(`${baseUrl}/config`)
      if (gc.ok) {
        const gcData = await gc.json()
        globalCompatibility = gcData.compatibility ?? gcData.compatibilityLevel ?? ""
      }
    } catch {
      // non-fatal
    }

    // 3. Fetch details for each subject in parallel, tolerating individual failures
    const now = new Date()
    const detailResults = await Promise.allSettled(
      allSubjects.map(async (subject) => {
        const encoded = encodeURIComponent(subject)
        const [versionsResult, latestResult, configResult] = await Promise.allSettled([
          fetch(`${baseUrl}/subjects/${encoded}/versions`).then((r) =>
            r.ok ? (r.json() as Promise<number[]>) : Promise.reject(new Error(`${r.status}`))
          ),
          fetch(`${baseUrl}/subjects/${encoded}/versions/latest`).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))
          ),
          fetch(`${baseUrl}/config/${encoded}`).then((r) => (r.ok ? r.json() : null)),
        ])

        const versions =
          versionsResult.status === "fulfilled" ? versionsResult.value : [1]
        const latestData =
          latestResult.status === "fulfilled" ? latestResult.value : null
        const configData =
          configResult.status === "fulfilled" ? configResult.value : null

        return {
          subject,
          schemaType: (latestData?.schemaType as string | undefined) ?? "AVRO",
          versionCount: versions.length,
          latestVersion: versions[versions.length - 1] ?? 1,
          compatibility:
            (configData?.compatibility as string | undefined) ??
            (configData?.compatibilityLevel as string | undefined) ??
            globalCompatibility,
          syncedAt: now,
        }
      })
    )

    type SubjectDetail = {
      subject: string
      schemaType: string
      versionCount: number
      latestVersion: number
      compatibility: string
      syncedAt: Date
    }

    // 4. Collect successful upserts
    const toUpsert: SubjectDetail[] = detailResults
      .filter((r): r is PromiseFulfilledResult<SubjectDetail> => r.status === "fulfilled")
      .map((r) => r.value)

    for (const item of toUpsert) {
      await prisma.schemaSubject.upsert({
        where: { clusterId_subject: { clusterId: id, subject: item.subject } },
        create: { clusterId: id, ...item },
        update: {
          schemaType: item.schemaType,
          versionCount: item.versionCount,
          latestVersion: item.latestVersion,
          compatibility: item.compatibility,
          syncedAt: item.syncedAt,
        },
      })
    }

    // 5. Remove subjects no longer in the registry
    const syncedSubjects = toUpsert.map((s) => s.subject)
    if (syncedSubjects.length > 0) {
      await prisma.schemaSubject.deleteMany({
        where: { clusterId: id, subject: { notIn: syncedSubjects } },
      })
    }

    // 6. Return refreshed list from DB
    const rows = await prisma.schemaSubject.findMany({
      where: { clusterId: id },
      orderBy: { subject: "asc" },
    })

    const subjects: SubjectSummary[] = rows.map((r) => ({
      subject: r.subject,
      schemaType: r.schemaType,
      versionCount: r.versionCount,
      latestVersion: r.latestVersion,
      compatibility: r.compatibility,
    }))

    return NextResponse.json({
      success: true,
      data: { subjects, syncedAt: now.toISOString(), schemaRegistryUrl: baseUrl },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[POST /schema-registry/sync] error", err)
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}
