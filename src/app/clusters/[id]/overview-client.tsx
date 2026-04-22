"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  ArrowLeft,
  Server,
  BookOpen,
  Layers,
  MessageSquare,
  Users,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Shield,
  Loader2,
  Database,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { MetricCard } from "@/components/metric-card"
import { Cluster, ClusterAuthType, ApiResponse } from "@/types"
import type { ClusterOverview } from "@/app/api/clusters/[id]/overview/route"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Auth label helpers (mirrors page.tsx on the clusters list)
// ---------------------------------------------------------------------------

const AUTH_LABEL: Record<ClusterAuthType, string> = {
  none: "No Auth",
  sasl_plain: "SASL Plain",
  sasl_scram_256: "SCRAM-256",
  sasl_scram_512: "SCRAM-512",
  ssl: "SSL/TLS",
}

const AUTH_BADGE_VARIANT: Record<
  ClusterAuthType,
  "secondary" | "default" | "warning" | "success"
> = {
  none: "secondary",
  sasl_plain: "default",
  sasl_scram_256: "default",
  sasl_scram_512: "default",
  ssl: "success",
}

// ---------------------------------------------------------------------------
// Test-connection state
// ---------------------------------------------------------------------------

type TestStatus = "idle" | "testing" | "ok" | "error"

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function MetricCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#1F2937] bg-[#111827] px-5 py-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-9 w-16 mt-1" />
    </div>
  )
}

function BrokerTableSkeleton() {
  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1F2937]">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="divide-y divide-[#1F2937]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-40 flex-1" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Brokers table
// ---------------------------------------------------------------------------

interface BrokersTableProps {
  brokers: ClusterOverview["brokers"]
}

function BrokersTable({ brokers }: BrokersTableProps) {
  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1F2937]">
        <h2 className="text-sm font-semibold text-white">Brokers</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {brokers.length} broker{brokers.length !== 1 ? "s" : ""} in this cluster
        </p>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[80px_1fr_140px] gap-4 px-5 py-2.5 border-b border-[#1F2937] bg-[#0B0F19]">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Node ID
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Host : Port
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Role
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#1F2937]">
        {brokers.map((broker) => (
          <div
            key={broker.nodeId}
            className="grid grid-cols-[80px_1fr_140px] gap-4 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors"
          >
            {/* Node ID */}
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
              <span className="font-mono text-sm text-white">{broker.nodeId}</span>
            </div>

            {/* Host:Port */}
            <span className="font-mono text-sm text-blue-400 truncate">
              {broker.host}:{broker.port}
            </span>

            {/* Role badge */}
            {broker.isController ? (
              <Badge variant="default" className="w-fit">
                Controller
              </Badge>
            ) : (
              <Badge variant="secondary" className="w-fit">
                Broker
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quick link card
// ---------------------------------------------------------------------------

interface QuickLinkCardProps {
  href: string
  icon: React.ReactNode
  label: string
  description: string
}

function QuickLinkCard({ href, icon, label, description }: QuickLinkCardProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-[#1F2937] bg-[#111827] px-5 py-4 transition-all duration-200 hover:border-[#374151] hover:bg-[#1a2236]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B0F19] text-blue-400 group-hover:text-blue-300 transition-colors">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
          {label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-blue-400 shrink-0 transition-colors" />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

interface ClusterOverviewClientProps {
  cluster: Cluster
}

export function ClusterOverviewClient({ cluster }: ClusterOverviewClientProps) {
  const [testStatus, setTestStatus] = React.useState<TestStatus>("idle")
  const [testError, setTestError] = React.useState<string | null>(null)

  const {
    data: overview,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery<ClusterOverview>({
    queryKey: ["cluster-overview", cluster.id],
    queryFn: async () => {
      const res = await fetch(`/api/clusters/${cluster.id}/overview`)
      const json: ApiResponse<ClusterOverview> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data
    },
    retry: 1,
    staleTime: 30_000,
  })

  // Keep "fetched X ago" label live without re-querying Kafka
  const [, forceUpdate] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    if (!dataUpdatedAt) return
    const id = setInterval(forceUpdate, 30_000)
    return () => clearInterval(id)
  }, [dataUpdatedAt])

  function formatFetchedAt(ms: number): string {
    const diff = Math.floor((Date.now() - ms) / 1000)
    if (diff < 10) return "just now"
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  async function handleTestConnection() {
    setTestStatus("testing")
    setTestError(null)
    try {
      const res = await fetch(`/api/clusters/${cluster.id}/test-connection`, {
        method: "POST",
      })
      const json = await res.json()
      if (json.success) {
        setTestStatus("ok")
      } else {
        setTestStatus("error")
        setTestError(json.error ?? "Connection failed")
      }
    } catch {
      setTestStatus("error")
      setTestError("Network error — check the server")
    }
  }

  const showSchemaRegistry = Boolean(cluster.schema_registry_url)

  return (
    <div className="min-h-screen bg-[#0B0F19]">
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* ── Back nav ── */}
        <div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-white"
          >
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Back to clusters
            </Link>
          </Button>
        </div>

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#111827] border border-[#1F2937] shrink-0">
              <Server className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {cluster.name}
              </h1>
              {cluster.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {cluster.description}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Badge variant={AUTH_BADGE_VARIANT[cluster.auth_type]}>
                  <Shield className="h-3 w-3 mr-1" />
                  {AUTH_LABEL[cluster.auth_type]}
                </Badge>
                {showSchemaRegistry && (
                  <Badge variant="secondary">
                    <Database className="h-3 w-3 mr-1" />
                    Schema Registry
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Test connection button */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testStatus === "testing"}
              className={cn(
                testStatus === "ok" && "border-green-500/40 text-green-400 hover:text-green-300",
                testStatus === "error" && "border-red-500/40 text-red-400 hover:text-red-300"
              )}
            >
              {testStatus === "testing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : testStatus === "ok" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : testStatus === "error" ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {testStatus === "testing"
                ? "Testing…"
                : testStatus === "ok"
                ? "Connected"
                : testStatus === "error"
                ? "Failed"
                : "Test Connection"}
            </Button>
            {testStatus === "error" && testError && (
              <p className="text-xs text-red-400 max-w-[240px] text-right">{testError}</p>
            )}
          </div>
        </div>

        <Separator className="bg-[#1F2937]" />

        {/* ── Fetched-at row ── */}
        {!isLoading && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {dataUpdatedAt
                ? `Data fetched ${formatFetchedAt(dataUpdatedAt)}`
                : isError
                ? "Could not fetch cluster data"
                : null}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-muted-foreground hover:text-white h-7 px-2"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        )}

        {/* ── Metric cards ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-6 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-red-400 mb-1">
              Failed to load cluster overview
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
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              title="Brokers"
              value={overview?.brokers.length}
              icon={<Server className="h-4 w-4" />}
              description="Live broker nodes"
            />
            <MetricCard
              title="Topics"
              value={overview?.topicCount}
              icon={<Layers className="h-4 w-4" />}
              description="Total topics"
            />
            <MetricCard
              title="Partitions"
              value={overview?.partitionCount}
              icon={<MessageSquare className="h-4 w-4" />}
              description="Across all topics"
            />
            <MetricCard
              title="Consumer Groups"
              value={overview?.consumerGroupCount}
              icon={<Users className="h-4 w-4" />}
              description="Registered groups"
            />
          </div>
        )}

        {/* ── Brokers table ── */}
        {isLoading ? (
          <BrokerTableSkeleton />
        ) : !isError && overview ? (
          <BrokersTable brokers={overview.brokers} />
        ) : null}

        {/* ── Quick links ── */}
        {!isLoading && !isError && (
          <>
            <Separator className="bg-[#1F2937]" />

            <div>
              <h2 className="text-sm font-semibold text-white mb-3">Quick Navigation</h2>
              <div className={cn(
                "grid gap-3",
                showSchemaRegistry
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                  : "grid-cols-1 sm:grid-cols-3"
              )}>
                <QuickLinkCard
                  href={`/clusters/${cluster.id}/topics`}
                  icon={<Layers className="h-5 w-5" />}
                  label="Topics"
                  description="Browse and manage topics"
                />
                <QuickLinkCard
                  href={`/clusters/${cluster.id}/topics`}
                  icon={<MessageSquare className="h-5 w-5" />}
                  label="Messages"
                  description="Inspect topic messages"
                />
                <QuickLinkCard
                  href={`/clusters/${cluster.id}/consumer-groups`}
                  icon={<Users className="h-5 w-5" />}
                  label="Consumer Groups"
                  description="Monitor consumer group lag"
                />
                {showSchemaRegistry && (
                  <QuickLinkCard
                    href={`/clusters/${cluster.id}/schema-registry`}
                    icon={<BookOpen className="h-5 w-5" />}
                    label="Schema Registry"
                    description="Browse subjects and schemas"
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
