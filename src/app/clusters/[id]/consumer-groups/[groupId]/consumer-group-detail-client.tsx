"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  ArrowLeft,
  Users,
  RefreshCw,
  AlertCircle,
  InboxIcon,
  Monitor,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { MetricCard } from "@/components/metric-card"
import { Cluster, ApiResponse } from "@/types"
import type { ConsumerGroupDetail } from "@/app/api/clusters/[id]/consumer-groups/[groupId]/route"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConsumerGroupDetailClientProps {
  cluster: Cluster
  groupId: string
}

// ---------------------------------------------------------------------------
// Helpers — state badge
// ---------------------------------------------------------------------------

function StateBadge({ state }: { state: string }) {
  if (state === "Stable") {
    return <Badge variant="success">{state}</Badge>
  }
  if (state === "Empty") {
    return <Badge variant="warning">{state}</Badge>
  }
  return <Badge variant="error">{state}</Badge>
}

// ---------------------------------------------------------------------------
// Helpers — lag cell colour
// ---------------------------------------------------------------------------

function lagClass(lag: number): string {
  if (lag === 0) return "text-green-400"
  if (lag <= 1_000) return "text-amber-400"
  return "text-red-400"
}

// ---------------------------------------------------------------------------
// Skeleton — partition offsets table
// ---------------------------------------------------------------------------

function OffsetTableSkeleton() {
  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
      <div className="grid grid-cols-[1fr_90px_150px_150px_100px] gap-4 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-20" />
        ))}
      </div>
      <div className="divide-y divide-[#1F2937]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_90px_150px_150px_100px] gap-4 items-center px-5 py-3"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton — members list
// ---------------------------------------------------------------------------

function MembersListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-[#1F2937] bg-[#111827] px-5 py-4 space-y-2"
        >
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Metric card skeleton
// ---------------------------------------------------------------------------

function MetricCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#1F2937] bg-[#111827] px-5 py-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-9 w-16 mt-1" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Partition Offsets tab content
// ---------------------------------------------------------------------------

interface PartitionOffsetsTabProps {
  offsets: ConsumerGroupDetail["offsets"]
}

function PartitionOffsetsTab({ offsets }: PartitionOffsetsTabProps) {
  if (offsets.length === 0) {
    return (
      <div className="rounded-2xl border border-[#1F2937] bg-[#111827] py-16 text-center">
        <InboxIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-sm font-semibold text-white mb-1">
          No offset data available
        </p>
        <p className="text-xs text-muted-foreground">
          This group has no committed offsets.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_90px_160px_160px_100px] gap-4 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
        {["Topic", "Partition", "Committed Offset", "Latest Offset", "Lag"].map(
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

      {/* Rows — already sorted by lag desc from the API */}
      <div className="divide-y divide-[#1F2937]">
        {offsets.map((row) => (
          <div
            key={`${row.topic}-${row.partition}`}
            className="grid grid-cols-[1fr_90px_160px_160px_100px] gap-4 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors"
          >
            {/* Topic */}
            <span className="font-mono text-sm text-blue-400 truncate">
              {row.topic}
            </span>

            {/* Partition */}
            <span className="font-mono text-sm tabular-nums text-white">
              {row.partition}
            </span>

            {/* Committed offset */}
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {row.committedOffset}
            </span>

            {/* Latest offset */}
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {row.latestOffset}
            </span>

            {/* Lag */}
            <span
              className={cn(
                "font-mono text-sm tabular-nums font-medium",
                lagClass(row.lag)
              )}
            >
              {row.lag.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-[#1F2937] bg-[#0B0F19] px-5 py-2.5">
        <span className="text-xs text-muted-foreground">
          {offsets.length} partition{offsets.length !== 1 ? "s" : ""} — sorted by lag descending
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Members tab content
// ---------------------------------------------------------------------------

interface MembersTabProps {
  members: ConsumerGroupDetail["members"]
}

function MembersTab({ members }: MembersTabProps) {
  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-[#1F2937] bg-[#111827] py-16 text-center">
        <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-sm font-semibold text-white mb-1">No active members</p>
        <p className="text-xs text-muted-foreground">
          This group currently has no connected consumers.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {members.map((member) => (
        <div
          key={member.memberId}
          className="rounded-2xl border border-[#1F2937] bg-[#111827] px-5 py-4"
        >
          {/* Member ID (truncated) */}
          <div className="flex items-start gap-2 mb-3">
            <Monitor className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <p
              className="font-mono text-sm text-white truncate"
              title={member.memberId}
            >
              {member.memberId.length > 60
                ? `${member.memberId.slice(0, 60)}…`
                : member.memberId}
            </p>
          </div>

          {/* Client ID + Host */}
          <div className="ml-6 grid grid-cols-1 gap-1 sm:grid-cols-2 mb-3">
            <div>
              <span className="text-xs text-muted-foreground">Client ID</span>
              <p className="font-mono text-sm text-white">{member.clientId}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Host</span>
              <p className="font-mono text-sm text-white">{member.clientHost}</p>
            </div>
          </div>

          {/* Assigned topic-partitions */}
          {member.assignedTopicPartitions.length > 0 && (
            <div className="ml-6">
              <span className="text-xs text-muted-foreground block mb-1.5">
                Assigned Partitions
              </span>
              <div className="flex flex-wrap gap-1.5">
                {member.assignedTopicPartitions.map(({ topic, partitions }) =>
                  partitions.map((p) => (
                    <Badge
                      key={`${topic}-${p}`}
                      variant="secondary"
                      className="font-mono text-[10px] py-0"
                    >
                      {topic}:{p}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function ConsumerGroupDetailClient({
  cluster,
  groupId,
}: ConsumerGroupDetailClientProps) {
  const {
    data: detail,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ConsumerGroupDetail>({
    queryKey: ["consumer-group-detail", cluster.id, groupId],
    queryFn: async () => {
      const res = await fetch(
        `/api/clusters/${cluster.id}/consumer-groups/${encodeURIComponent(groupId)}`
      )
      const json: ApiResponse<ConsumerGroupDetail> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data
    },
    retry: 1,
    staleTime: 30_000,
  })

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
            <Link href={`/clusters/${cluster.id}/consumer-groups`}>
              <ArrowLeft className="h-4 w-4" />
              Back to consumer groups
            </Link>
          </Button>
        </div>

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111827] border border-[#1F2937] shrink-0">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              {/* Group ID — monospace, truncated */}
              <h1
                className="text-xl font-semibold tracking-tight text-white font-mono truncate"
                title={groupId}
              >
                {groupId}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {isLoading ? (
                  <>
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </>
                ) : detail ? (
                  <>
                    <StateBadge state={detail.state} />
                    {detail.protocol && (
                      <Badge variant="secondary">{detail.protocol}</Badge>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="text-muted-foreground shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <Separator className="bg-[#1F2937]" />

        {/* ── Total lag metric ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
        ) : !isError && detail ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MetricCard
              title="Total Lag"
              value={detail.totalLag.toLocaleString()}
              icon={<RefreshCw className="h-4 w-4" />}
              description="Messages behind latest offset"
            />
            <MetricCard
              title="Members"
              value={detail.members.length}
              icon={<Users className="h-4 w-4" />}
              description="Active consumers"
            />
            <MetricCard
              title="Partitions"
              value={detail.offsets.length}
              icon={<Monitor className="h-4 w-4" />}
              description="Assigned partitions"
            />
          </div>
        ) : null}

        {/* ── Error state ── */}
        {isError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-red-400 mb-1">
              Failed to load consumer group details
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
          <Tabs defaultValue="offsets">
            <TabsList>
              <TabsTrigger value="offsets">Partition Offsets</TabsTrigger>
              <TabsTrigger value="members">
                Members
                {detail && (
                  <span className="ml-1.5 rounded-full bg-[#1F2937] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {detail.members.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Partition Offsets */}
            <TabsContent value="offsets" className="mt-4">
              {isLoading ? (
                <OffsetTableSkeleton />
              ) : detail ? (
                <PartitionOffsetsTab offsets={detail.offsets} />
              ) : null}
            </TabsContent>

            {/* Members */}
            <TabsContent value="members" className="mt-4">
              {isLoading ? (
                <MembersListSkeleton />
              ) : detail ? (
                <MembersTab members={detail.members} />
              ) : null}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
