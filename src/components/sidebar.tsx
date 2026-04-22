"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  BarChart2,
  BookOpen,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Layers,
  Loader2,
  Plus,
  Server,
  Settings,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Cluster, ApiResponse } from "@/types"

// ---------------------------------------------------------------------------
// Per-cluster sub-nav
// ---------------------------------------------------------------------------

const CLUSTER_SUB_NAV: {
  label: string
  href: (id: string) => string
  icon: React.ElementType
  isActive?: (pathname: string, id: string) => boolean
}[] = [
  {
    label: "Topics",
    href: (id) => `/clusters/${id}/topics`,
    icon: Layers,
    // active for topics + topic detail, but NOT the dashboard sub-route
    isActive: (pathname, id) =>
      pathname.startsWith(`/clusters/${id}/topics`) &&
      !pathname.startsWith(`/clusters/${id}/topics/dashboard`),
  },
  {
    label: "Topic Metrics",
    href: (id) => `/clusters/${id}/topics/dashboard`,
    icon: BarChart2,
  },
  {
    label: "Consumer Groups",
    href: (id) => `/clusters/${id}/consumer-groups`,
    icon: Users,
  },
]

interface ClusterNavItemProps {
  cluster: Cluster
  isExpanded: boolean
  onToggle: () => void
  pathname: string
}

function ClusterNavItem({ cluster, isExpanded, onToggle, pathname }: ClusterNavItemProps) {
  const isClusterActive = pathname.startsWith(`/clusters/${cluster.id}`)

  return (
    <li>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isClusterActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Server className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left truncate">{cluster.name}</span>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 opacity-50 shrink-0" />
        )}
      </button>

      {isExpanded && (
        <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-sidebar-border pl-3">
          {CLUSTER_SUB_NAV.map((item) => {
            const href = item.href(String(cluster.id))
            const isActive = item.isActive
              ? item.isActive(pathname, String(cluster.id))
              : pathname.startsWith(href)
            return (
              <li key={item.label}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </Link>
              </li>
            )
          })}
          {cluster.schema_registry_url && (
            <li>
              <Link
                href={`/clusters/${cluster.id}/schema-registry`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  pathname.startsWith(`/clusters/${cluster.id}/schema-registry`)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                Schema Registry
              </Link>
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname()

  const activeClusterId = pathname.match(/^\/clusters\/([^/]+)/)?.[1] ?? null

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(
    () => new Set(activeClusterId ? [activeClusterId] : [])
  )

  React.useEffect(() => {
    if (activeClusterId) {
      setExpandedIds((prev) => {
        if (prev.has(activeClusterId)) return prev
        return new Set([...prev, activeClusterId])
      })
    }
  }, [activeClusterId])

  const { data: clusters, isLoading } = useQuery<Cluster[]>({
    queryKey: ["clusters"],
    queryFn: async () => {
      const res = await fetch("/api/clusters")
      const json: ApiResponse<Cluster[]> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data
    },
    staleTime: 60_000,
  })

  function toggleCluster(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isDashboardActive = pathname === "/"
  const isSettingsActive = pathname.startsWith("/settings")

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo / brand */}
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <Activity className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-base font-semibold tracking-tight text-sidebar-foreground">
          StreamLens
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-1">
        {/* Dashboard */}
        <ul className="space-y-0.5">
          <li>
            <Link
              href="/"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isDashboardActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              <span className="flex-1">Dashboard</span>
              {isDashboardActive && <ChevronRight className="h-3.5 w-3.5 opacity-50" />}
            </Link>
          </li>
        </ul>

        {/* Clusters section */}
        <div className="mt-3">
          <div className="flex items-center justify-between px-3 mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Clusters
            </span>
            <Link
              href="/"
              className="text-muted-foreground hover:text-sidebar-foreground transition-colors"
              title="Add cluster"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          ) : !clusters?.length ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No clusters.{" "}
              <Link href="/" className="underline hover:text-sidebar-foreground">
                Add one
              </Link>
            </p>
          ) : (
            <ul className="space-y-0.5">
              {clusters.map((cluster) => (
                <ClusterNavItem
                  key={cluster.id}
                  cluster={cluster}
                  isExpanded={expandedIds.has(String(cluster.id))}
                  onToggle={() => toggleCluster(String(cluster.id))}
                  pathname={pathname}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Settings pinned to bottom of nav */}
        <ul className="mt-auto pt-3 space-y-0.5">
          <li>
            <Link
              href="/settings"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isSettingsActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className="flex-1">Settings</span>
              {isSettingsActive && <ChevronRight className="h-3.5 w-3.5 opacity-50" />}
            </Link>
          </li>
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="text-xs text-muted-foreground">StreamLens v0.1.0</p>
      </div>
    </aside>
  )
}
