"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  ArrowLeft,
  BookOpen,
  Copy,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Cluster, ApiResponse } from "@/types"
import type { SchemaVersionDetail } from "@/app/api/clusters/[id]/schema-registry/subjects/[subject]/versions/[version]/route"
import { cn } from "@/lib/utils"

interface CachedSubjectInfo {
  schemaType: string
  versionCount: number
  latestVersion: number
  compatibility: string
}

interface SubjectDetailClientProps {
  cluster: Cluster
  subjectName: string
  cached: CachedSubjectInfo | null
}

// ---------------------------------------------------------------------------
// Badge helpers (mirrors list page)
// ---------------------------------------------------------------------------

function SchemaTypeBadge({ type }: { type: string }) {
  const t = type.toUpperCase()
  if (t === "AVRO")
    return <Badge variant="default" className="bg-blue-600 text-white border-0">AVRO</Badge>
  if (t === "JSON")
    return <Badge variant="default" className="bg-green-700 text-white border-0">JSON</Badge>
  if (t === "PROTOBUF")
    return <Badge variant="default" className="bg-purple-700 text-white border-0">PROTO</Badge>
  return <Badge variant="secondary">{type || "UNKNOWN"}</Badge>
}

function CompatibilityBadge({ mode }: { mode: string }) {
  if (!mode) return null
  const m = mode.toUpperCase()
  if (m.startsWith("FULL") || m.startsWith("BACKWARD"))
    return <Badge variant="success">{mode}</Badge>
  if (m.startsWith("FORWARD"))
    return <Badge variant="default">{mode}</Badge>
  if (m === "NONE")
    return <Badge variant="warning">NONE</Badge>
  return <Badge variant="secondary">{mode}</Badge>
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-7 px-2 text-muted-foreground hover:text-white"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Version selector
// ---------------------------------------------------------------------------

interface VersionSelectorProps {
  latestVersion: number
  selected: number | "latest"
  onChange: (v: number | "latest") => void
}

function VersionSelector({ latestVersion, selected, onChange }: VersionSelectorProps) {
  const versions = Array.from({ length: latestVersion }, (_, i) => latestVersion - i)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Version:</span>
      <button
        onClick={() => onChange("latest")}
        className={cn(
          "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
          selected === "latest"
            ? "bg-blue-600 text-white"
            : "bg-[#1F2937] text-muted-foreground hover:text-white"
        )}
      >
        latest
      </button>
      {versions.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            "px-2.5 py-1 rounded-md text-xs font-mono transition-colors",
            selected === v
              ? "bg-blue-600 text-white"
              : "bg-[#1F2937] text-muted-foreground hover:text-white"
          )}
        >
          v{v}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Schema viewer
// ---------------------------------------------------------------------------

function SchemaViewer({ schema, schemaType }: { schema: string; schemaType: string }) {
  let formatted = schema
  try {
    formatted = JSON.stringify(JSON.parse(schema), null, 2)
  } catch {
    // not JSON — show raw (e.g. Protobuf)
  }

  return (
    <div className="rounded-xl border border-[#1F2937] bg-[#0B0F19] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1F2937] bg-[#111827]">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Schema · {schemaType}
        </span>
        <CopyButton text={schema} />
      </div>
      <pre className="p-4 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-relaxed max-h-[60vh] overflow-y-auto">
        {formatted}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SubjectDetailClient({
  cluster,
  subjectName,
  cached,
}: SubjectDetailClientProps) {
  const [selectedVersion, setSelectedVersion] = React.useState<number | "latest">("latest")

  const versionParam =
    selectedVersion === "latest" ? "latest" : String(selectedVersion)

  const {
    data: schemaDetail,
    isLoading,
    isError,
    error,
  } = useQuery<SchemaVersionDetail>({
    queryKey: ["schema-version", cluster.id, subjectName, versionParam],
    queryFn: async () => {
      const res = await fetch(
        `/api/clusters/${cluster.id}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${versionParam}`
      )
      const json: ApiResponse<SchemaVersionDetail> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data
    },
    retry: 1,
    staleTime: 300_000,
  })

  const displayType = schemaDetail?.schemaType ?? cached?.schemaType ?? "UNKNOWN"
  const displayCompatibility = cached?.compatibility ?? ""
  const latestVersion = cached?.latestVersion ?? 1

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
            <Link href={`/clusters/${cluster.id}/schema-registry`}>
              <ArrowLeft className="h-4 w-4" />
              Back to subjects
            </Link>
          </Button>
        </div>

        {/* ── Header ── */}
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111827] border border-[#1F2937] shrink-0">
            <BookOpen className="h-5 w-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-white font-mono break-all">
              {subjectName}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{cluster.name}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <SchemaTypeBadge type={displayType} />
              {displayCompatibility && <CompatibilityBadge mode={displayCompatibility} />}
              {cached && (
                <Badge variant="secondary" className="text-[10px]">
                  {cached.versionCount} version{cached.versionCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator className="bg-[#1F2937]" />

        {/* ── Version selector ── */}
        <div className="rounded-xl border border-[#1F2937] bg-[#111827] px-4 py-3">
          <VersionSelector
            latestVersion={latestVersion}
            selected={selectedVersion}
            onChange={setSelectedVersion}
          />
        </div>

        {/* ── Schema viewer ── */}
        {isLoading ? (
          <div className="rounded-xl border border-[#1F2937] bg-[#111827] p-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading schema…</span>
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-red-400 mb-1">Failed to load schema</p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        ) : schemaDetail ? (
          <>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Schema ID: <span className="font-mono text-white">{schemaDetail.schemaId}</span></span>
              <span>Version: <span className="font-mono text-white">{schemaDetail.version}</span></span>
            </div>
            <SchemaViewer schema={schemaDetail.schema} schemaType={schemaDetail.schemaType} />
          </>
        ) : null}
      </div>
    </div>
  )
}
