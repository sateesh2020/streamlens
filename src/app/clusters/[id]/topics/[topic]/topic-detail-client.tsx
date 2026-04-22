"use client"

import * as React from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Layers,
  Trash2,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Settings2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Cluster, ApiResponse } from "@/types"
import type { TopicDetail } from "@/app/api/clusters/[id]/topics/[topic]/route"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TopicDetailClientProps {
  cluster: Cluster
  topicName: string
}

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

function PartitionTableSkeleton() {
  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
      <div className="grid grid-cols-[80px_80px_1fr_1fr_120px_120px_100px] gap-3 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16" />
        ))}
      </div>
      <div className="divide-y divide-[#1F2937]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[80px_80px_1fr_1fr_120px_120px_100px] gap-3 items-center px-5 py-3"
          >
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ConfigTableSkeleton() {
  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
      <div className="divide-y divide-[#1F2937]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Partitions tab
// ---------------------------------------------------------------------------

interface PartitionsTabProps {
  partitions: TopicDetail["partitions"]
}

function PartitionsTab({ partitions }: PartitionsTabProps) {
  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[80px_80px_1fr_1fr_130px_130px_100px] gap-3 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
        {[
          "Partition",
          "Leader",
          "Replicas",
          "ISR",
          "Earliest Offset",
          "Latest Offset",
          "Messages",
        ].map((h) => (
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
        {partitions.map((p) => (
          <div
            key={p.partitionId}
            className={cn(
              "grid grid-cols-[80px_80px_1fr_1fr_130px_130px_100px] gap-3 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors",
              p.isUnderReplicated && "border-l-2 border-l-amber-500"
            )}
          >
            {/* Partition ID */}
            <span className="font-mono text-sm text-white tabular-nums">
              {p.partitionId}
            </span>

            {/* Leader */}
            <span className="font-mono text-sm text-white tabular-nums">
              {p.leader}
            </span>

            {/* Replicas */}
            <span className="font-mono text-xs text-muted-foreground truncate">
              [{p.replicas.join(", ")}]
            </span>

            {/* ISR */}
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "font-mono text-xs truncate",
                  p.isUnderReplicated ? "text-amber-400" : "text-muted-foreground"
                )}
              >
                [{p.isr.join(", ")}]
              </span>
              {p.isUnderReplicated && (
                <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
              )}
            </div>

            {/* Earliest offset */}
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {p.earliestOffset}
            </span>

            {/* Latest offset */}
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {p.latestOffset}
            </span>

            {/* Message count */}
            <span className="font-mono text-sm text-white tabular-nums">
              {p.messageCount.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Configuration tab
// ---------------------------------------------------------------------------

interface ConfigTabProps {
  configs: Record<string, string>
}

function ConfigTab({ configs }: ConfigTabProps) {
  const entries = Object.entries(configs).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-[#1F2937] bg-[#111827] px-5 py-10 text-center">
        <Settings2 className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-sm text-muted-foreground">
          No configuration entries returned.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[2fr_3fr] gap-4 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Key
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Value
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#1F2937]">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="grid grid-cols-[2fr_3fr] gap-4 items-start px-5 py-2.5 hover:bg-white/[0.02] transition-colors"
          >
            <span className="font-mono text-xs text-blue-400 break-all">
              {key}
            </span>
            <span className="font-mono text-xs text-white break-all">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirm dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  topicName: string
  onConfirm: () => void
  isDeleting: boolean
  deleteError: string | null
}

function DeleteDialog({
  open,
  onOpenChange,
  topicName,
  onConfirm,
  isDeleting,
  deleteError,
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Topic</DialogTitle>
          <DialogDescription>
            This will permanently delete{" "}
            <span className="font-mono text-white">{topicName}</span> and all
            its messages. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {deleteError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{deleteError}</p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete Topic
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function TopicDetailClient({
  cluster,
  topicName,
}: TopicDetailClientProps) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const {
    data: detail,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<TopicDetail>({
    queryKey: ["topic-detail", cluster.id, topicName],
    queryFn: async () => {
      const res = await fetch(
        `/api/clusters/${cluster.id}/topics/${encodeURIComponent(topicName)}`
      )
      const json: ApiResponse<TopicDetail> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data
    },
    retry: 1,
    staleTime: 30_000,
  })

  const deleteMutation = useMutation<ApiResponse<{ name: string }>, Error>({
    mutationFn: async () => {
      const res = await fetch(
        `/api/clusters/${cluster.id}/topics/${encodeURIComponent(topicName)}`,
        { method: "DELETE" }
      )
      return res.json() as Promise<ApiResponse<{ name: string }>>
    },
    onSuccess: (data) => {
      if (data.success) {
        setDeleteOpen(false)
        router.push(`/clusters/${cluster.id}/topics`)
      } else {
        setDeleteError(data.error)
      }
    },
    onError: (err) => {
      setDeleteError(err.message)
    },
  })

  const underReplicatedCount =
    detail?.partitions.filter((p) => p.isUnderReplicated).length ?? 0

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
            <Link href={`/clusters/${cluster.id}/topics`}>
              <ArrowLeft className="h-4 w-4" />
              Back to topics
            </Link>
          </Button>
        </div>

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111827] border border-[#1F2937] shrink-0">
              <Layers className="h-5 w-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-white font-mono truncate">
                {topicName}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {isLoading ? (
                  <>
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </>
                ) : detail ? (
                  <>
                    <Badge variant="default" className="gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {detail.totalMessageCount.toLocaleString()} messages
                    </Badge>
                    <Badge variant="secondary">
                      RF: {detail.replicationFactor}
                    </Badge>
                    {underReplicatedCount > 0 && (
                      <Badge variant="warning" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {underReplicatedCount} under-replicated
                      </Badge>
                    )}
                    {underReplicatedCount === 0 && (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Healthy
                      </Badge>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="text-muted-foreground"
            >
              <RefreshCw
                className={cn("h-4 w-4", isLoading && "animate-spin")}
              />
              Refresh
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-blue-400 border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-300"
            >
              <Link
                href={`/clusters/${cluster.id}/topics/${encodeURIComponent(topicName)}/messages`}
              >
                <MessageSquare className="h-4 w-4" />
                Browse Messages
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => {
                setDeleteError(null)
                setDeleteOpen(true)
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <Separator className="bg-[#1F2937]" />

        {/* ── Error state ── */}
        {isError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-red-400 mb-1">
              Failed to load topic details
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="border-red-500/30 text-red-400 hover:text-red-300"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        )}

        {/* ── Tabs ── */}
        {!isError && (
          <Tabs defaultValue="partitions">
            <TabsList>
              <TabsTrigger value="partitions">Partitions</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
            </TabsList>

            {/* Partitions tab */}
            <TabsContent value="partitions" className="mt-4">
              {isLoading ? (
                <PartitionTableSkeleton />
              ) : detail ? (
                <>
                  <PartitionsTab partitions={detail.partitions} />
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      {detail.partitions.length} partition
                      {detail.partitions.length !== 1 ? "s" : ""}
                    </span>
                    {underReplicatedCount > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        {underReplicatedCount} under-replicated —{" "}
                        ISR count is below replication factor
                      </span>
                    )}
                  </div>
                </>
              ) : null}
            </TabsContent>

            {/* Configuration tab */}
            <TabsContent value="configuration" className="mt-4">
              {isLoading ? (
                <ConfigTableSkeleton />
              ) : detail ? (
                <ConfigTab configs={detail.configs} />
              ) : null}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* ── Delete dialog ── */}
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        topicName={topicName}
        onConfirm={() => deleteMutation.mutate()}
        isDeleting={deleteMutation.isPending}
        deleteError={deleteError}
      />
    </div>
  )
}
