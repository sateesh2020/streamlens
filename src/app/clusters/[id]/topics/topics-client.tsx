"use client"

import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import {
  ArrowLeft,
  Layers,
  Search,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  InboxIcon,
  Loader2,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Cluster, ApiResponse } from "@/types"
import type { TopicSummary, TopicsListResponse } from "@/app/api/clusters/[id]/topics/route"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TopicsClientProps {
  cluster: Cluster
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
      <div className="grid grid-cols-[1fr_100px_140px_140px_120px] gap-4 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
        {["Topic Name", "Partitions", "Replication", "Under-rep.", "Messages"].map(
          (h) => (
            <span
              key={h}
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {h}
            </span>
          )
        )}
      </div>
      <div className="divide-y divide-[#1F2937]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_100px_140px_140px_120px] gap-4 items-center px-5 py-3"
          >
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Topic row
// ---------------------------------------------------------------------------

interface TopicRowProps {
  topic: TopicSummary
  clusterId: number
  onCountRetry: (name: string) => void
  isRetrying: boolean
}

function TopicRow({ topic, clusterId, onCountRetry, isRetrying }: TopicRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_100px_140px_140px_120px] gap-4 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors",
        topic.hasUnderReplicatedPartitions && "border-l-2 border-l-amber-500"
      )}
    >
      {/* Topic name */}
      <div className="flex items-center gap-2 min-w-0">
        <Link
          href={`/clusters/${clusterId}/topics/${encodeURIComponent(topic.name)}`}
          className="font-mono text-sm text-blue-400 hover:text-blue-300 transition-colors truncate"
        >
          {topic.name}
        </Link>
        {topic.isInternal && (
          <Badge variant="secondary" className="shrink-0 text-[10px] py-0">
            internal
          </Badge>
        )}
      </div>

      {/* Partitions */}
      <span className="font-mono text-sm text-white tabular-nums">
        {topic.partitionCount}
      </span>

      {/* Replication factor */}
      <span className="font-mono text-sm text-white tabular-nums">
        {topic.replicationFactor}
      </span>

      {/* Under-replicated */}
      <div>
        {topic.hasUnderReplicatedPartitions ? (
          <Badge variant="warning" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Under-rep.
          </Badge>
        ) : (
          <Badge variant="success">Healthy</Badge>
        )}
      </div>

      {/* Message count (snapshot from last sync) */}
      <div className="flex items-center gap-1.5">
        {topic.messageCountSyncFailed ? (
          <>
            <span className="text-xs text-amber-400">failed</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 shrink-0"
              onClick={() => onCountRetry(topic.name)}
              disabled={isRetrying}
              title="Retry fetching message count"
            >
              {isRetrying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </>
        ) : (
          <span className="font-mono text-sm text-white tabular-nums">
            {topic.totalMessageCount > 0
              ? topic.totalMessageCount.toLocaleString()
              : <span className="text-muted-foreground">0</span>}
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

function formatSyncedAt(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function TopicsClient({ cluster }: TopicsClientProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const [hideInternal, setHideInternal] = React.useState(true)
  const [retryingTopic, setRetryingTopic] = React.useState<string | null>(null)

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery<TopicsListResponse>({
    queryKey: ["topics", cluster.id, !hideInternal],
    queryFn: async () => {
      const url = new URL(
        `/api/clusters/${cluster.id}/topics`,
        window.location.origin
      )
      if (!hideInternal) url.searchParams.set("includeInternal", "true")
      const res = await fetch(url.toString())
      const json: ApiResponse<TopicsListResponse> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data
    },
    retry: 1,
    staleTime: 60_000,
  })

  const topics = data?.topics ?? []
  const syncedAt = data?.syncedAt ?? null
  const neverSynced = !isLoading && !isError && syncedAt === null

  const syncMutation = useMutation<
    ApiResponse<TopicsListResponse>,
    Error
  >({
    mutationFn: async () => {
      const res = await fetch(`/api/clusters/${cluster.id}/topics/sync`, {
        method: "POST",
      })
      return res.json() as Promise<ApiResponse<TopicsListResponse>>
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.setQueryData(
          ["topics", cluster.id, !hideInternal],
          result.data
        )
      }
    },
  })

  const retryCountMutation = useMutation<
    ApiResponse<{ name: string; totalMessageCount: number }>,
    Error,
    string
  >({
    mutationFn: async (topicName) => {
      const res = await fetch(
        `/api/clusters/${cluster.id}/topics/${encodeURIComponent(topicName)}`,
        { method: "PATCH" }
      )
      return res.json()
    },
    onMutate: (topicName) => setRetryingTopic(topicName),
    onSettled: () => setRetryingTopic(null),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["topics", cluster.id] })
      }
    },
  })

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return topics.filter((t) => !q || t.name.toLowerCase().includes(q))
  }, [topics, search])

  const isSyncing = syncMutation.isPending

  return (
    <div className="min-h-screen bg-[#0B0F19]">
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* ── Back nav ── */}
        <div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-white"
          >
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
              <Layers className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">
                Topics
              </h1>
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
            Sync from Kafka
          </Button>
        </div>

        <Separator className="bg-[#1F2937]" />

        {/* ── Never-synced banner ── */}
        {neverSynced && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-400 shrink-0" />
              <p className="text-sm text-blue-300">
                No cached topics yet. Sync to fetch the latest topics from Kafka.
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

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Filter topics…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              role="checkbox"
              aria-checked={hideInternal}
              onClick={() => setHideInternal((v) => !v)}
              className={cn(
                "relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none",
                hideInternal ? "bg-blue-600" : "bg-[#1F2937]"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-lg ring-0 transition-transform",
                  hideInternal ? "translate-x-4" : "translate-x-0"
                )}
              />
            </div>
            <span className="text-sm text-muted-foreground">
              Hide internal topics
            </span>
          </label>

          {topics.length > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length} of {topics.length} topic
              {topics.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* ── Table / States ── */}
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-red-400 mb-1">
              Failed to load topics
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        ) : filtered.length === 0 && !neverSynced ? (
          <div className="rounded-2xl border border-[#1F2937] bg-[#111827] py-16 text-center">
            <InboxIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold text-white mb-1">
              No topics found
            </p>
            <p className="text-xs text-muted-foreground">
              {search
                ? "No topics match your search filter."
                : "This cluster has no topics yet."}
            </p>
          </div>
        ) : filtered.length > 0 ? (
          <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_100px_140px_140px_120px] gap-4 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
              {["Topic Name", "Partitions", "Replication", "Health", "Messages"].map((h) => (
                <span
                  key={h}
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#1F2937]">
              {filtered.map((topic) => (
                <TopicRow
                  key={topic.name}
                  topic={topic}
                  clusterId={cluster.id}
                  onCountRetry={(name) => retryCountMutation.mutate(name)}
                  isRetrying={retryingTopic === topic.name}
                />
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-[#1F2937] bg-[#0B0F19] px-5 py-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {filtered.length} topic{filtered.length !== 1 ? "s" : ""}
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
            Click a topic name to view partition details and configuration.
          </p>
        )}
      </div>
    </div>
  )
}
