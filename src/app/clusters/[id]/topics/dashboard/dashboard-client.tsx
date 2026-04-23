"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { ArrowLeft, BarChart2, TrendingUp, TrendingDown, Minus, InboxIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Cluster, ApiResponse } from "@/types"
import type { TopicsHistoryResponse, TopicHistory } from "@/app/api/clusters/[id]/topics/history/route"
import { cn } from "@/lib/utils"

interface Props {
  cluster: Cluster
}

// ---------------------------------------------------------------------------
// Colour palette for chart lines
// ---------------------------------------------------------------------------

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#84cc16", "#6366f1",
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${parseInt(m)}/${parseInt(d)}`
}

// Pivot history into recharts-compatible rows: [{ date, topicA: n, topicB: n, ... }]
function buildChartData(topHistory: TopicHistory[]): Record<string, string | number>[] {
  const allDates = [
    ...new Set(topHistory.flatMap((h) => h.snapshots.map((s) => s.date))),
  ].sort()

  return allDates.map((date) => {
    const row: Record<string, string | number> = { date }
    for (const h of topHistory) {
      const snap = h.snapshots.find((s) => s.date === date)
      row[h.topicName] = snap?.messageCount ?? 0
    }
    return row
  })
}

// Messages added during the period (last snapshot - first snapshot, clamped to 0)
function topicGrowth(h: TopicHistory): number {
  if (h.snapshots.length < 2) return 0
  return Math.max(0, h.snapshots[h.snapshots.length - 1].messageCount - h.snapshots[0].messageCount)
}

// Latest count (last snapshot)
function latestCount(h: TopicHistory): number {
  if (!h.snapshots.length) return 0
  return h.snapshots[h.snapshots.length - 1].messageCount
}

// Percentage change between first and last snapshot
function trend(h: TopicHistory): number | null {
  if (h.snapshots.length < 2) return null
  const first = h.snapshots[0].messageCount
  const last = h.snapshots[h.snapshots.length - 1].messageCount
  if (first === 0) return null
  return ((last - first) / first) * 100
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#1F2937] bg-[#111827] p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trend indicator
// ---------------------------------------------------------------------------

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>
  if (Math.abs(pct) < 0.5) return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" /> 0%
    </span>
  )
  const up = pct > 0
  return (
    <span className={cn("flex items-center gap-0.5 text-xs font-medium", up ? "text-emerald-400" : "text-red-400")}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[#1F2937] bg-[#0B0F19] px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1.5 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground truncate max-w-[140px]">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold text-white">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const DAYS_OPTIONS = [7, 14, 30] as const
type DaysOption = (typeof DAYS_OPTIONS)[number]
const TOP_N = 10

export function TopicsDashboardClient({ cluster }: Props) {
  const [days, setDays] = React.useState<DaysOption>(30)

  const { data, isLoading, isError } = useQuery<TopicsHistoryResponse>({
    queryKey: ["topics-history", cluster.id, days],
    queryFn: async () => {
      const res = await fetch(`/api/clusters/${cluster.id}/topics/history?days=${days}`)
      const json: ApiResponse<TopicsHistoryResponse> = await res.json()
      if (!json.success) throw new Error((json as { error: string }).error)
      return json.data
    },
    staleTime: 5 * 60_000,
  })

  // Exclude internal/system topics (__ or _ prefix) then sort by latest count
  const sortedHistory = React.useMemo(
    () =>
      (data?.history ?? [])
        .filter((h) => !h.topicName.startsWith("_"))
        .sort((a, b) => latestCount(b) - latestCount(a)),
    [data]
  )

  const topHistory = sortedHistory.slice(0, TOP_N)
  const chartData = React.useMemo(() => buildChartData(topHistory), [topHistory])

  // Summary stats
  const totalTopics = sortedHistory.length
  const totalMessages = sortedHistory.reduce((s, h) => s + latestCount(h), 0)
  const topTopic = sortedHistory[0]

  const hasData = sortedHistory.length > 0 && sortedHistory.some((h) => h.snapshots.length > 0)

  return (
    <div className="min-h-screen bg-[#0B0F19]">
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/clusters/${cluster.id}/topics`}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-semibold text-white">Topic Metrics</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{cluster.name}</p>
            </div>
          </div>

          {/* Day range selector */}
          <div className="flex items-center gap-1 rounded-lg border border-[#1F2937] bg-[#111827] p-1">
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  days === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-white"
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading metrics…</span>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Failed to load topic history. Make sure you have run a sync at least once.
          </div>
        )}

        {/* No data */}
        {!isLoading && !isError && !hasData && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <InboxIcon className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="text-white font-medium">No snapshot data yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Daily snapshots are recorded automatically on every sync.
                Go to{" "}
                <Link href={`/clusters/${cluster.id}/topics`} className="underline hover:text-white">
                  Topics
                </Link>{" "}
                and run a sync to start collecting data.
              </p>
            </div>
          </div>
        )}

        {!isLoading && !isError && hasData && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                label="Topics tracked"
                value={totalTopics.toString()}
                sub={`over the last ${days} days`}
              />
              <StatCard
                label="Total messages (latest)"
                value={fmt(totalMessages)}
                sub="sum across all tracked topics"
              />
              <StatCard
                label="Most active topic"
                value={topTopic ? fmt(latestCount(topTopic)) : "—"}
                sub={topTopic?.topicName ?? "—"}
              />
            </div>

            {/* Area chart */}
            <div className="rounded-xl border border-[#1F2937] bg-[#111827] p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-white">
                  Daily message counts
                  {sortedHistory.length > TOP_N && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (top {TOP_N} of {sortedHistory.length} topics)
                    </span>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data?.from} → {data?.to}
                </p>
              </div>

              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    {topHistory.map((h, i) => (
                      <linearGradient key={h.topicName} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6B7280", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={fmtDate}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "#6B7280", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={fmt}
                    width={48}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "#9CA3AF", paddingTop: 12 }}
                    formatter={(v) => v.length > 28 ? v.slice(0, 26) + "…" : v}
                  />
                  {topHistory.map((h, i) => (
                    <Area
                      key={h.topicName}
                      type="monotone"
                      dataKey={h.topicName}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={1.5}
                      fill={`url(#grad-${i})`}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Topics table */}
            <div className="rounded-xl border border-[#1F2937] bg-[#111827] overflow-hidden">
              <div className="grid grid-cols-[1fr_120px_120px_100px] gap-4 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
                {["Topic", "Latest count", "Growth (period)", "Trend"].map((h) => (
                  <span key={h} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {h}
                  </span>
                ))}
              </div>

              <div className="divide-y divide-[#1F2937]">
                {sortedHistory.map((h, i) => {
                  const color = i < TOP_N ? COLORS[i % COLORS.length] : undefined
                  return (
                    <div
                      key={h.topicName}
                      className="grid grid-cols-[1fr_120px_120px_100px] gap-4 px-5 py-3 items-center hover:bg-[#0B0F19]/60 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {color && (
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                        )}
                        <span className="text-sm text-white truncate font-mono">{h.topicName}</span>
                      </div>
                      <span className="text-sm text-white tabular-nums">{fmt(latestCount(h))}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {h.snapshots.length < 2 ? <span className="text-muted-foreground/50">—</span> : `+${fmt(topicGrowth(h))}`}
                      </span>
                      <TrendBadge pct={trend(h)} />
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
