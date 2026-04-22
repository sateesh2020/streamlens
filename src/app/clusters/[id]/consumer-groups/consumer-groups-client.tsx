"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  ArrowLeft,
  Users,
  Search,
  RefreshCw,
  AlertCircle,
  InboxIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { MetricCard } from "@/components/metric-card"
import { Cluster, ApiResponse } from "@/types"
import type { ConsumerGroupSummary } from "@/app/api/clusters/[id]/consumer-groups/route"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConsumerGroupsClientProps {
  cluster: Cluster
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
// Helpers — lag cell
// ---------------------------------------------------------------------------

function LagCell({ lag }: { lag: number }) {
  if (lag > 10_000) {
    return (
      <span className="font-mono text-sm tabular-nums text-red-400">
        {lag.toLocaleString()}
      </span>
    )
  }
  if (lag > 1_000) {
    return (
      <span className="font-mono text-sm tabular-nums text-amber-400">
        {lag.toLocaleString()}
      </span>
    )
  }
  return (
    <span className="font-mono text-sm tabular-nums text-white">
      {lag.toLocaleString()}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Skeleton — 6 rows
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_120px_90px_80px_120px] gap-4 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
        {["Group ID", "State", "Members", "Topics", "Total Lag"].map((h) => (
          <span
            key={h}
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {h}
          </span>
        ))}
      </div>
      <div className="divide-y divide-[#1F2937]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_120px_90px_80px_120px] gap-4 items-center px-5 py-3"
          >
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
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
// Main client component
// ---------------------------------------------------------------------------

export function ConsumerGroupsClient({ cluster }: ConsumerGroupsClientProps) {
  const [search, setSearch] = React.useState("")

  const {
    data: groups,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ConsumerGroupSummary[]>({
    queryKey: ["consumer-groups", cluster.id],
    queryFn: async () => {
      const res = await fetch(`/api/clusters/${cluster.id}/consumer-groups`)
      const json: ApiResponse<ConsumerGroupSummary[]> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data
    },
    retry: 1,
    staleTime: 30_000,
  })

  // Derived metrics
  const totalGroups = groups?.length ?? 0
  const totalLag = React.useMemo(
    () => groups?.reduce((sum, g) => sum + g.totalLag, 0) ?? 0,
    [groups]
  )

  // Filtered list
  const filtered = React.useMemo(() => {
    if (!groups) return []
    const q = search.trim().toLowerCase()
    return q ? groups.filter((g) => g.groupId.toLowerCase().includes(q)) : groups
  }, [groups, search])

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
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">
                Consumer Groups
              </h1>
              <p className="text-sm text-muted-foreground">{cluster.name}</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="text-muted-foreground"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <Separator className="bg-[#1F2937]" />

        {/* ── Metric cards ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
        ) : !isError ? (
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              title="Total Groups"
              value={totalGroups}
              icon={<Users className="h-4 w-4" />}
              description="Consumer groups registered"
            />
            <MetricCard
              title="Total Lag"
              value={totalLag.toLocaleString()}
              icon={<RefreshCw className="h-4 w-4" />}
              description="Messages behind across all groups"
            />
          </div>
        ) : null}

        {/* ── Search toolbar ── */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Filter by group ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {groups && (
            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length} of {groups.length} group
              {groups.length !== 1 ? "s" : ""}
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
              Failed to load consumer groups
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
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-[#1F2937] bg-[#111827] py-16 text-center">
            <InboxIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold text-white mb-1">
              No consumer groups found
            </p>
            <p className="text-xs text-muted-foreground">
              {search
                ? "No groups match your search filter."
                : "This cluster has no consumer groups."}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_90px_80px_120px] gap-4 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
              {["Group ID", "State", "Members", "Topics", "Total Lag"].map(
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

            {/* Rows */}
            <div className="divide-y divide-[#1F2937]">
              {filtered.map((group) => (
                <div
                  key={group.groupId}
                  className="grid grid-cols-[1fr_120px_90px_80px_120px] gap-4 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  {/* Group ID — clickable */}
                  <Link
                    href={`/clusters/${cluster.id}/consumer-groups/${encodeURIComponent(group.groupId)}`}
                    className="font-mono text-sm text-blue-400 hover:text-blue-300 transition-colors truncate"
                  >
                    {group.groupId}
                  </Link>

                  {/* State */}
                  <StateBadge state={group.state} />

                  {/* Members */}
                  <span className="font-mono text-sm tabular-nums text-white">
                    {group.memberCount}
                  </span>

                  {/* Topics */}
                  <span className="font-mono text-sm tabular-nums text-white">
                    {group.topicCount}
                  </span>

                  {/* Total lag */}
                  <LagCell lag={group.totalLag} />
                </div>
              ))}
            </div>

            {/* Footer count */}
            <div className="border-t border-[#1F2937] bg-[#0B0F19] px-5 py-2.5">
              <span className="text-xs text-muted-foreground">
                {filtered.length} group{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
