"use client"

import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import {
  ArrowLeft,
  BookOpen,
  Search,
  RefreshCw,
  AlertCircle,
  InboxIcon,
  Loader2,
  ChevronRight,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Cluster, ApiResponse } from "@/types"
import type {
  SubjectSummary,
  SubjectsListResponse,
} from "@/app/api/clusters/[id]/schema-registry/subjects/route"
import { cn } from "@/lib/utils"

interface SchemaRegistryClientProps {
  cluster: Cluster
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function SchemaTypeBadge({ type }: { type: string }) {
  const t = type.toUpperCase()
  if (t === "AVRO")
    return <Badge variant="default" className="bg-blue-600 text-white border-0 text-[10px]">AVRO</Badge>
  if (t === "JSON")
    return <Badge variant="default" className="bg-green-700 text-white border-0 text-[10px]">JSON</Badge>
  if (t === "PROTOBUF")
    return <Badge variant="default" className="bg-purple-700 text-white border-0 text-[10px]">PROTO</Badge>
  return <Badge variant="secondary" className="text-[10px]">{type || "UNKNOWN"}</Badge>
}

function CompatibilityBadge({ mode }: { mode: string }) {
  if (!mode) return <span className="text-xs text-muted-foreground">—</span>
  const m = mode.toUpperCase()
  if (m.startsWith("FULL"))
    return <Badge variant="success" className="text-[10px]">{mode}</Badge>
  if (m.startsWith("BACKWARD"))
    return <Badge variant="success" className="text-[10px]">{mode}</Badge>
  if (m.startsWith("FORWARD"))
    return <Badge variant="default" className="text-[10px]">{mode}</Badge>
  if (m === "NONE")
    return <Badge variant="warning" className="text-[10px]">NONE</Badge>
  return <Badge variant="secondary" className="text-[10px]">{mode}</Badge>
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
      <div className="grid grid-cols-[1fr_100px_80px_160px] gap-4 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
        {["Subject", "Type", "Versions", "Compatibility"].map((h) => (
          <span key={h} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {h}
          </span>
        ))}
      </div>
      <div className="divide-y divide-[#1F2937]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[1fr_100px_80px_160px] gap-4 items-center px-5 py-3">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unconfigured state
// ---------------------------------------------------------------------------

function UnconfiguredState({ clusterId }: { clusterId: number }) {
  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] px-6 py-12 flex flex-col items-center gap-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B0F19] border border-[#1F2937]">
        <Info className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-white">No Schema Registry configured</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-md">
          This cluster does not have a Schema Registry URL. To enable schema browsing,
          remove the cluster and re-add it with a Schema Registry URL.
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="text-muted-foreground">
        <Link href={`/clusters/${clusterId}`}>Back to overview</Link>
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subject row
// ---------------------------------------------------------------------------

function SubjectRow({ subject, clusterId }: { subject: SubjectSummary; clusterId: number }) {
  return (
    <div className="grid grid-cols-[1fr_100px_80px_160px] gap-4 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors">
      <Link
        href={`/clusters/${clusterId}/schema-registry/${encodeURIComponent(subject.subject)}`}
        className="font-mono text-sm text-blue-400 hover:text-blue-300 transition-colors truncate"
      >
        {subject.subject}
      </Link>
      <div><SchemaTypeBadge type={subject.schemaType} /></div>
      <span className="font-mono text-sm text-white tabular-nums">{subject.versionCount}</span>
      <div><CompatibilityBadge mode={subject.compatibility} /></div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSyncedAt(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SchemaRegistryClient({ cluster }: SchemaRegistryClientProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")

  const { data, isLoading, isError, error } = useQuery<SubjectsListResponse>({
    queryKey: ["schema-subjects", cluster.id],
    queryFn: async () => {
      const res = await fetch(`/api/clusters/${cluster.id}/schema-registry/subjects`)
      const json: ApiResponse<SubjectsListResponse> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data
    },
    retry: 1,
    staleTime: 60_000,
    enabled: Boolean(cluster.schema_registry_url),
  })

  const syncMutation = useMutation<ApiResponse<SubjectsListResponse>, Error>({
    mutationFn: async () => {
      const res = await fetch(`/api/clusters/${cluster.id}/schema-registry/sync`, {
        method: "POST",
      })
      return res.json() as Promise<ApiResponse<SubjectsListResponse>>
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.setQueryData(["schema-subjects", cluster.id], result.data)
      }
    },
  })

  const subjects = data?.subjects ?? []
  const syncedAt = data?.syncedAt ?? null
  const neverSynced = !isLoading && !isError && syncedAt === null
  const isSyncing = syncMutation.isPending

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return subjects.filter((s) => !q || s.subject.toLowerCase().includes(q))
  }, [subjects, search])

  if (!cluster.schema_registry_url) {
    return (
      <div className="min-h-screen bg-[#0B0F19]">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-white">
              <Link href={`/clusters/${cluster.id}`}>
                <ArrowLeft className="h-4 w-4" />
                Back to overview
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111827] border border-[#1F2937] shrink-0">
              <BookOpen className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">Schema Registry</h1>
              <p className="text-sm text-muted-foreground">{cluster.name}</p>
            </div>
          </div>
          <Separator className="bg-[#1F2937]" />
          <UnconfiguredState clusterId={cluster.id} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F19]">
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* ── Back nav ── */}
        <div>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-white">
            <Link href={`/clusters/${cluster.id}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to overview
            </Link>
          </Button>
        </div>

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111827] border border-[#1F2937] shrink-0">
              <BookOpen className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">Schema Registry</h1>
              <p className="text-sm text-muted-foreground">
                {cluster.name}
                {syncedAt && (
                  <span className="ml-2 text-xs text-muted-foreground/60">
                    · synced {formatSyncedAt(syncedAt)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={isSyncing}
            className="text-muted-foreground"
          >
            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
            Sync from Registry
          </Button>
        </div>

        <Separator className="bg-[#1F2937]" />

        {/* ── Never-synced banner ── */}
        {neverSynced && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-400 shrink-0" />
              <p className="text-sm text-blue-300">
                No cached subjects yet. Sync to fetch from the Schema Registry.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={isSyncing}
              className="shrink-0 border-blue-500/40 text-blue-400 hover:text-blue-300"
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync now
            </Button>
          </div>
        )}

        {/* ── Sync error ── */}
        {syncMutation.isError && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">
              Sync failed: {syncMutation.error.message}
            </p>
          </div>
        )}

        {/* ── Search toolbar ── */}
        {!neverSynced && (
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Filter subjects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            {subjects.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                {filtered.length} of {subjects.length} subject{subjects.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {/* ── Table / States ── */}
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-red-400 mb-1">Failed to load subjects</p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        ) : filtered.length === 0 && !neverSynced ? (
          <div className="rounded-2xl border border-[#1F2937] bg-[#111827] py-16 text-center">
            <InboxIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold text-white mb-1">No subjects found</p>
            <p className="text-xs text-muted-foreground">
              {search ? "No subjects match your filter." : "This registry has no subjects."}
            </p>
          </div>
        ) : filtered.length > 0 ? (
          <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_80px_160px] gap-4 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
              {["Subject", "Type", "Versions", "Compatibility"].map((h) => (
                <span key={h} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {h}
                </span>
              ))}
            </div>
            <div className="divide-y divide-[#1F2937]">
              {filtered.map((s) => (
                <SubjectRow key={s.subject} subject={s} clusterId={cluster.id} />
              ))}
            </div>
            <div className="border-t border-[#1F2937] bg-[#0B0F19] px-5 py-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {filtered.length} subject{filtered.length !== 1 ? "s" : ""}
              </span>
              {syncedAt && (
                <span className="text-xs text-muted-foreground/60">
                  Last synced {formatSyncedAt(syncedAt)}
                </span>
              )}
            </div>
          </div>
        ) : null}

        {!isLoading && !isError && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            Click a subject to view versions and schema content.
          </p>
        )}
      </div>
    </div>
  )
}
