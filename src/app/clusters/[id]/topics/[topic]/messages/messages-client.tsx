"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  InboxIcon,
  Loader2,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Cluster, MessageRecord, ApiResponse } from "@/types"
import type { TopicDetail } from "@/app/api/clusters/[id]/topics/[topic]/route"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessagesClientProps {
  cluster: Cluster
  topicName: string
}

type OffsetMode = "latest" | "earliest" | "from-offset"
type FetchStatus = "idle" | "loading" | "success" | "error"

interface FetchState {
  status: FetchStatus
  messages: MessageRecord[]
  hasMore: boolean
  error: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Kafka timestamp (ms since epoch as string) into a human-readable relative time. */
function formatRelativeTime(timestampMs: string): string {
  const ts = parseInt(timestampMs, 10)
  if (isNaN(ts) || ts <= 0) return "unknown"
  const diff = Date.now() - ts
  if (diff < 0) return "just now"
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}

/** Format a Kafka timestamp as a full ISO-ish datetime string for tooltips. */
function formatFullTimestamp(timestampMs: string): string {
  const ts = parseInt(timestampMs, 10)
  if (isNaN(ts) || ts <= 0) return "N/A"
  return new Date(ts).toISOString().replace("T", " ").replace("Z", " UTC")
}

/** Truncate a string to maxLen, appending ellipsis if needed. */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + "…"
}

/** Estimate byte size of a string (UTF-8). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// Simple JSON syntax highlighter (no library dependency)
// ---------------------------------------------------------------------------

function JsonHighlight({ json }: { json: string }) {
  // Tokenise the JSON string and wrap tokens with color spans
  const tokens = React.useMemo(() => {
    // Split the JSON into colourable segments
    const result: Array<{ text: string; cls: string }> = []
    const tokenRe =
      /("(?:\\.|[^"\\])*")\s*(:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\],])/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = tokenRe.exec(json)) !== null) {
      if (match.index > lastIndex) {
        result.push({ text: json.slice(lastIndex, match.index), cls: "" })
      }
      if (match[1] !== undefined) {
        // string — key or value
        if (match[2] !== undefined) {
          // followed by ":" → it's a key
          result.push({ text: match[1], cls: "text-blue-300" })
          result.push({ text: ":", cls: "text-white" })
        } else {
          result.push({ text: match[1], cls: "text-green-300" })
        }
      } else if (match[3] !== undefined) {
        result.push({ text: match[3], cls: "text-yellow-300" })
      } else if (match[4] !== undefined) {
        result.push({ text: match[4], cls: "text-purple-300" })
      } else if (match[5] !== undefined) {
        result.push({ text: match[5], cls: "text-gray-400" })
      }
      lastIndex = tokenRe.lastIndex
    }
    if (lastIndex < json.length) {
      result.push({ text: json.slice(lastIndex), cls: "" })
    }
    return result
  }, [json])

  return (
    <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
      {tokens.map((tok, i) => (
        <span key={i} className={tok.cls}>
          {tok.text}
        </span>
      ))}
    </pre>
  )
}

// ---------------------------------------------------------------------------
// Expanded message detail panel (shown inline below the row)
// ---------------------------------------------------------------------------

interface ExpandedMessageProps {
  msg: MessageRecord
}

function ExpandedMessage({ msg }: ExpandedMessageProps) {
  const headerEntries = Object.entries(msg.headers)

  return (
    <div className="bg-[#0B0F19] border-t border-[#1F2937] px-5 py-4 space-y-4">
      {/* Meta row */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span>
          <span className="text-white font-medium">Offset: </span>
          <span className="font-mono">{msg.offset}</span>
        </span>
        <span>
          <span className="text-white font-medium">Partition: </span>
          <span className="font-mono">{msg.partition}</span>
        </span>
        <span>
          <span className="text-white font-medium">Timestamp: </span>
          <span className="font-mono">{formatFullTimestamp(msg.timestamp)}</span>
        </span>
        <span>
          <span className="text-white font-medium">Size: </span>
          <span className="font-mono">{formatBytes(msg.size)}</span>
        </span>
      </div>

      {/* Key */}
      <div>
        <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
          Key
        </p>
        {msg.key === null ? (
          <span className="font-mono text-xs text-muted-foreground italic">null</span>
        ) : (
          <pre className="font-mono text-xs text-white bg-[#111827] border border-[#1F2937] rounded-lg px-3 py-2 whitespace-pre-wrap break-all">
            {msg.key}
          </pre>
        )}
      </div>

      {/* Headers */}
      {headerEntries.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
            Headers
          </p>
          <div className="rounded-lg border border-[#1F2937] bg-[#111827] divide-y divide-[#1F2937] overflow-hidden">
            {headerEntries.map(([k, v]) => (
              <div key={k} className="flex items-start gap-3 px-3 py-1.5">
                <span className="font-mono text-xs text-blue-300 shrink-0 min-w-[8rem] break-all">
                  {k}
                </span>
                <span className="font-mono text-xs text-white break-all">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Value */}
      <div>
        <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
          Value
        </p>
        {msg.value === null ? (
          <span className="font-mono text-xs text-muted-foreground italic">null</span>
        ) : (
          <div className="rounded-lg border border-[#1F2937] bg-[#0d1117] px-3 py-3 max-h-96 overflow-auto">
            <JsonHighlight json={msg.value} />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Message row
// ---------------------------------------------------------------------------

interface MessageRowProps {
  msg: MessageRecord
  isExpanded: boolean
  onToggle: () => void
}

function MessageRow({ msg, isExpanded, onToggle }: MessageRowProps) {
  const relTime = formatRelativeTime(msg.timestamp)
  const fullTime = formatFullTimestamp(msg.timestamp)
  const valuePreview =
    msg.value !== null ? truncate(msg.value.replace(/\n/g, " "), 100) : null

  return (
    <div className="border-b border-[#1F2937] last:border-b-0">
      {/* Main row */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full text-left grid grid-cols-[90px_70px_140px_1fr_2fr] gap-3 items-center px-5 py-3",
          "hover:bg-white/[0.02] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50",
          isExpanded && "bg-white/[0.02]"
        )}
      >
        {/* Offset */}
        <span className="font-mono text-xs text-muted-foreground tabular-nums truncate">
          {msg.offset}
        </span>

        {/* Partition */}
        <div>
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 tabular-nums">
            P{msg.partition}
          </Badge>
        </div>

        {/* Timestamp */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="text-xs text-muted-foreground truncate cursor-default" />
              }
            >
              {relTime}
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-mono text-xs">{fullTime}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Key */}
        <span
          className={cn(
            "font-mono text-xs truncate",
            msg.key === null ? "text-muted-foreground italic" : "text-blue-300"
          )}
        >
          {msg.key === null ? "null" : truncate(msg.key, 40)}
        </span>

        {/* Value preview + expand indicator */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs text-white/70 truncate flex-1">
            {valuePreview === null ? (
              <span className="text-muted-foreground italic">null</span>
            ) : (
              valuePreview
            )}
          </span>
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && <ExpandedMessage msg={msg} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filter bar skeleton (while loading partitions)
// ---------------------------------------------------------------------------

function FilterBarSkeleton() {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <Skeleton className="h-8 w-40 rounded-lg" />
      <Skeleton className="h-8 w-40 rounded-lg" />
      <Skeleton className="h-8 w-24 rounded-lg" />
      <Skeleton className="h-8 w-20 rounded-lg" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function MessagesClient({ cluster, topicName }: MessagesClientProps) {
  // ── Partition metadata (fetched once on mount) ──
  const [partitionCount, setPartitionCount] = React.useState<number | null>(null)
  const [metaError, setMetaError] = React.useState<string | null>(null)
  const [metaLoading, setMetaLoading] = React.useState(true)

  // ── Filter state ──
  const [selectedPartition, setSelectedPartition] = React.useState<string>("all")
  const [offsetMode, setOffsetMode] = React.useState<OffsetMode>("latest")
  const [customOffset, setCustomOffset] = React.useState<string>("")
  const [limit, setLimit] = React.useState<string>("50")

  // ── Fetch state ──
  const [fetchState, setFetchState] = React.useState<FetchState>({
    status: "idle",
    messages: [],
    hasMore: false,
    error: null,
  })

  // ── Expanded row ──
  const [expandedOffset, setExpandedOffset] = React.useState<string | null>(null)

  // Load partition metadata on mount
  React.useEffect(() => {
    let cancelled = false
    setMetaLoading(true)
    setMetaError(null)

    fetch(`/api/clusters/${cluster.id}/topics/${encodeURIComponent(topicName)}`)
      .then((r) => r.json() as Promise<ApiResponse<TopicDetail>>)
      .then((json) => {
        if (cancelled) return
        if (!json.success) {
          setMetaError(json.error)
        } else {
          setPartitionCount(json.data.partitions.length)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMetaError(err instanceof Error ? err.message : "Failed to load topic metadata")
        }
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster.id, topicName])

  // ── Fetch messages handler ──
  const fetchMessages = React.useCallback(async () => {
    setFetchState({ status: "loading", messages: [], hasMore: false, error: null })
    setExpandedOffset(null)

    try {
      const url = new URL(
        `/api/clusters/${cluster.id}/topics/${encodeURIComponent(topicName)}/messages`,
        window.location.origin
      )
      url.searchParams.set("partition", selectedPartition)
      url.searchParams.set("limit", limit)

      if (offsetMode === "latest") {
        url.searchParams.set("offset", "latest")
      } else if (offsetMode === "earliest") {
        url.searchParams.set("offset", "earliest")
      } else {
        const parsed = parseInt(customOffset, 10)
        if (isNaN(parsed) || parsed < 0) {
          setFetchState({
            status: "error",
            messages: [],
            hasMore: false,
            error: "Please enter a valid non-negative offset number.",
          })
          return
        }
        url.searchParams.set("offset", String(parsed))
      }

      const res = await fetch(url.toString())
      const json: ApiResponse<{ messages: MessageRecord[]; hasMore: boolean }> =
        await res.json()

      if (!json.success) {
        setFetchState({
          status: "error",
          messages: [],
          hasMore: false,
          error: json.error,
        })
        return
      }

      setFetchState({
        status: "success",
        messages: json.data.messages,
        hasMore: json.data.hasMore,
        error: null,
      })
    } catch (err: unknown) {
      setFetchState({
        status: "error",
        messages: [],
        hasMore: false,
        error: err instanceof Error ? err.message : "An unexpected error occurred",
      })
    }
  }, [cluster.id, topicName, selectedPartition, offsetMode, customOffset, limit])

  const toggleExpanded = React.useCallback((key: string) => {
    setExpandedOffset((prev) => (prev === key ? null : key))
  }, [])

  // Build partition options from metadata
  const partitionOptions = React.useMemo(() => {
    if (partitionCount === null) return []
    return Array.from({ length: partitionCount }, (_, i) => String(i))
  }, [partitionCount])

  const { status, messages, hasMore, error } = fetchState

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
            <Link
              href={`/clusters/${cluster.id}/topics/${encodeURIComponent(topicName)}`}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to topic
            </Link>
          </Button>
        </div>

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111827] border border-[#1F2937] shrink-0">
              <MessageSquare className="h-5 w-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-white font-mono truncate">
                {topicName}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Message Browser &mdash; {cluster.name}
              </p>
            </div>
          </div>
        </div>

        <Separator className="bg-[#1F2937]" />

        {/* ── Sticky filter bar ── */}
        <div className="sticky top-0 z-10 bg-[#0B0F19] py-3 -mx-6 px-6 border-b border-[#1F2937]">
          {metaLoading ? (
            <FilterBarSkeleton />
          ) : metaError ? (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Could not load partition info: {metaError}</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 items-end">

              {/* Partition selector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">
                  Partition
                </label>
                <Select
                  value={selectedPartition}
                  onValueChange={(v) => { if (v !== null) setSelectedPartition(v) }}
                >
                  <SelectTrigger className="h-8 min-w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All partitions</SelectItem>
                    {partitionOptions.map((p) => (
                      <SelectItem key={p} value={p}>
                        Partition {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Offset mode selector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">
                  Start from
                </label>
                <Select
                  value={offsetMode}
                  onValueChange={(v) => { if (v !== null) setOffsetMode(v as OffsetMode) }}
                >
                  <SelectTrigger className="h-8 min-w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest messages</SelectItem>
                    <SelectItem value="earliest">From beginning</SelectItem>
                    <SelectItem value="from-offset">From offset</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom offset input (conditional) */}
              {offsetMode === "from-offset" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground font-medium">
                    Offset
                  </label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={customOffset}
                    onChange={(e) => setCustomOffset(e.target.value)}
                    className="h-8 w-28 font-mono text-sm"
                  />
                </div>
              )}

              {/* Limit selector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">
                  Limit
                </label>
                <Select value={limit} onValueChange={(v) => { if (v !== null) setLimit(v) }}>
                  <SelectTrigger className="h-8 min-w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["10", "25", "50", "100", "200"].map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fetch button */}
              <Button
                size="sm"
                onClick={() => void fetchMessages()}
                disabled={status === "loading"}
                className="h-8"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Fetching…
                  </>
                ) : (
                  <>
                    <Search className="h-3.5 w-3.5" />
                    Fetch
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* ── Content area ── */}
        <div>
          {/* Idle state */}
          {status === "idle" && (
            <div className="rounded-2xl border border-[#1F2937] bg-[#111827] py-16 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm font-semibold text-white mb-1">
                No messages loaded
              </p>
              <p className="text-xs text-muted-foreground">
                Choose your filters and click{" "}
                <span className="text-white font-medium">Fetch</span> to load
                messages.
              </p>
            </div>
          )}

          {/* Loading state */}
          {status === "loading" && (
            <div className="rounded-2xl border border-[#1F2937] bg-[#111827] py-16 text-center">
              <Loader2 className="h-8 w-8 text-blue-400 mx-auto mb-3 animate-spin" />
              <p className="text-sm text-muted-foreground">
                Fetching messages…
              </p>
            </div>
          )}

          {/* Error state */}
          {status === "error" && error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-8 text-center">
              <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-red-400 mb-1">
                Failed to fetch messages
              </p>
              <p className="text-xs text-muted-foreground mb-4">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchMessages()}
                className="border-red-500/30 text-red-400 hover:text-red-300"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          )}

          {/* Empty state */}
          {status === "success" && messages.length === 0 && (
            <div className="rounded-2xl border border-[#1F2937] bg-[#111827] py-16 text-center">
              <InboxIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm font-semibold text-white mb-1">
                No messages found
              </p>
              <p className="text-xs text-muted-foreground">
                No messages matched the selected filters. Try adjusting the
                partition, offset, or limit.
              </p>
            </div>
          )}

          {/* Messages table */}
          {status === "success" && messages.length > 0 && (
            <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[90px_70px_140px_1fr_2fr] gap-3 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
                {["Offset", "Partition", "Timestamp", "Key", "Value"].map(
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
              <div>
                {messages.map((msg) => {
                  const rowKey = `${msg.partition}-${msg.offset}`
                  return (
                    <MessageRow
                      key={rowKey}
                      msg={msg}
                      isExpanded={expandedOffset === rowKey}
                      onToggle={() => toggleExpanded(rowKey)}
                    />
                  )
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-[#1F2937] bg-[#0B0F19] px-5 py-2.5 flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">
                  Showing{" "}
                  <span className="text-white font-medium">
                    {messages.length}
                  </span>{" "}
                  message{messages.length !== 1 ? "s" : ""}
                </span>
                {hasMore && (
                  <span className="text-xs text-amber-400">
                    Limit reached — there may be more messages. Increase the
                    limit or narrow your filters.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
