"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Server, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { ClusterForm } from "@/components/cluster-form"
import { Cluster, ClusterAuthType, ApiResponse } from "@/types"

// ---------------------------------------------------------------------------
// Auth type display helpers
// ---------------------------------------------------------------------------
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

const AUTH_LABEL: Record<ClusterAuthType, string> = {
  none: "No Auth",
  sasl_plain: "SASL Plain",
  sasl_scram_256: "SCRAM-256",
  sasl_scram_512: "SCRAM-512",
  ssl: "SSL/TLS",
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function fetchClusters(): Promise<Cluster[]> {
  const res = await fetch("/api/clusters")
  const json: ApiResponse<Cluster[]> = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------
function ClusterCardSkeleton() {
  return (
    <Card className="bg-[#111827] border-[#1F2937]">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-24 mt-1" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </CardContent>
      <CardFooter className="gap-2">
        <Skeleton className="h-8 w-16" />
      </CardFooter>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Broker preview helper
// ---------------------------------------------------------------------------
function brokerPreview(brokers: string): string {
  const list = brokers
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean)
  if (list.length === 0) return "—"
  if (list.length === 1) return list[0]
  return `${list[0]} +${list.length - 1} more`
}

// ---------------------------------------------------------------------------
// Cluster card — read-only (no edit/delete; those are admin-only)
// ---------------------------------------------------------------------------
function ClusterCard({ cluster }: { cluster: Cluster }) {
  return (
    <Card className="bg-[#111827] border-[#1F2937] flex flex-col transition-all duration-200 hover:border-[#374151]">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold text-white">
            {cluster.name}
          </CardTitle>
          <Badge variant={AUTH_BADGE_VARIANT[cluster.auth_type]}>
            {AUTH_LABEL[cluster.auth_type]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground font-mono truncate">
          {brokerPreview(cluster.brokers)}
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-2">
        {cluster.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {cluster.description}
          </p>
        )}
        {cluster.schema_registry_url && (
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary">Schema Registry</Badge>
            <span className="text-xs text-muted-foreground truncate">
              {cluster.schema_registry_url}
            </span>
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2 flex-wrap border-t border-[#1F2937] pt-3 mt-auto">
        <Button asChild variant="blue" size="sm">
          <Link href={`/clusters/${cluster.id}`}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
interface EmptyStateProps {
  onAdd: () => void
}

function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#111827] border border-[#1F2937]">
        <Server className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white">No clusters yet</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Connect StreamLens to a Kafka cluster to start browsing topics,
          messages, and consumer groups.
        </p>
      </div>
      <Button variant="blue" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Add your first cluster
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ClustersPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: clusters, isLoading, isError } = useQuery({
    queryKey: ["clusters"],
    queryFn: fetchClusters,
  })

  function openAdd() {
    setDialogOpen(true)
  }

  function handleFormSuccess(cluster: Cluster) {
    queryClient.invalidateQueries({ queryKey: ["clusters"] })
    setDialogOpen(false)
    void cluster
  }

  function handleFormCancel() {
    setDialogOpen(false)
  }

  return (
    <div className="min-h-screen bg-[#0B0F19]">
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Clusters
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your Kafka cluster connections
            </p>
          </div>
          <Button variant="blue" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Add Cluster
          </Button>
        </div>

        {/* Error state */}
        {isError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Failed to load clusters. Check your database connection and refresh.
          </div>
        )}

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ClusterCardSkeleton />
            <ClusterCardSkeleton />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && clusters?.length === 0 && (
          <EmptyState onAdd={openAdd} />
        )}

        {/* Cluster grid */}
        {!isLoading && clusters && clusters.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {clusters.map((cluster) => (
              <ClusterCard key={cluster.id} cluster={cluster} />
            ))}
          </div>
        )}
      </div>

      {/* Add cluster dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) handleFormCancel()
        }}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-[#111827] border-[#1F2937]">
          <DialogHeader>
            <DialogTitle className="text-white">Add Cluster</DialogTitle>
            <DialogDescription>
              Connect StreamLens to a new Kafka cluster.
            </DialogDescription>
          </DialogHeader>

          <ClusterForm
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
