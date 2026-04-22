"use client"

import { useState } from "react"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { Cluster, ClusterAuthType, ClusterFormData } from "@/types"

interface ClusterFormProps {
  cluster?: Cluster
  onSuccess: (cluster: Cluster) => void
  onCancel: () => void
}

const AUTH_TYPE_LABELS: Record<ClusterAuthType, string> = {
  none: "None",
  sasl_plain: "SASL Plain",
  sasl_scram_256: "SASL SCRAM-256",
  sasl_scram_512: "SASL SCRAM-512",
  ssl: "SSL / TLS",
}

function parseAuthConfig(cluster?: Cluster): Record<string, unknown> {
  if (!cluster) return {}
  try {
    if (typeof cluster.auth_config === "string") {
      return JSON.parse(cluster.auth_config) as Record<string, unknown>
    }
    return (cluster.auth_config as Record<string, unknown>) ?? {}
  } catch {
    return {}
  }
}

export function ClusterForm({ cluster, onSuccess, onCancel }: ClusterFormProps) {
  const isEdit = !!cluster
  const existingAuthConfig = parseAuthConfig(cluster)

  // Core fields
  const [name, setName] = useState(cluster?.name ?? "")
  const [brokers, setBrokers] = useState(
    cluster ? cluster.brokers.split(",").join("\n") : ""
  )
  const [authType, setAuthType] = useState<ClusterAuthType>(
    cluster?.auth_type ?? "none"
  )
  const [schemaRegistryUrl, setSchemaRegistryUrl] = useState(
    cluster?.schema_registry_url ?? ""
  )
  const [description, setDescription] = useState(cluster?.description ?? "")

  // SASL fields
  const [saslUsername, setSaslUsername] = useState(
    String(existingAuthConfig.username ?? "")
  )
  const [saslPassword, setSaslPassword] = useState(
    String(existingAuthConfig.password ?? "")
  )

  // SSL fields
  const [sslCa, setSslCa] = useState(String(existingAuthConfig.ca ?? ""))
  const [sslCert, setSslCert] = useState(String(existingAuthConfig.cert ?? ""))
  const [sslKey, setSslKey] = useState(String(existingAuthConfig.key ?? ""))
  const [sslRejectUnauthorized, setSslRejectUnauthorized] = useState(
    existingAuthConfig.rejectUnauthorized !== false
  )

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [testResult, setTestResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  function buildAuthConfig(): Record<string, unknown> {
    if (authType === "sasl_plain" || authType === "sasl_scram_256" || authType === "sasl_scram_512") {
      return { username: saslUsername, password: saslPassword }
    }
    if (authType === "ssl") {
      const cfg: Record<string, unknown> = {
        rejectUnauthorized: sslRejectUnauthorized,
      }
      if (sslCa.trim()) cfg.ca = sslCa.trim()
      if (sslCert.trim()) cfg.cert = sslCert.trim()
      if (sslKey.trim()) cfg.key = sslKey.trim()
      return cfg
    }
    return {}
  }

  function normalizeBrokers(raw: string): string {
    return raw
      .split(/[\n,]/)
      .map((b) => b.trim())
      .filter(Boolean)
      .join(",")
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = "Name is required"
    if (!brokers.trim()) errs.brokers = "At least one broker is required"
    if (
      (authType === "sasl_plain" ||
        authType === "sasl_scram_256" ||
        authType === "sasl_scram_512") &&
      !saslUsername.trim()
    ) {
      errs.saslUsername = "Username is required"
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    setTestResult(null)

    const payload: ClusterFormData = {
      name: name.trim(),
      brokers: normalizeBrokers(brokers),
      auth_type: authType,
      auth_config: buildAuthConfig(),
      schema_registry_url: schemaRegistryUrl.trim() || undefined,
      description: description.trim() || undefined,
    }

    try {
      const url = isEdit ? `/api/clusters/${cluster.id}` : "/api/clusters"
      const method = isEdit ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const json = await res.json()

      if (!json.success) {
        setErrors({ form: json.error ?? "Failed to save cluster" })
        return
      }

      onSuccess(json.data as Cluster)
    } catch {
      setErrors({ form: "Network error — please try again" })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleTestConnection() {
    if (!validate()) return
    // We need a saved cluster id to call the endpoint; if creating, save first
    if (!isEdit) {
      setTestResult({
        ok: false,
        message: "Save the cluster first to test the connection.",
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const res = await fetch(`/api/clusters/${cluster.id}/test-connection`, {
        method: "POST",
      })
      const json = await res.json()
      if (json.success) {
        setTestResult({
          ok: true,
          message: `Connected — ${json.data.brokerCount} broker(s), controller node ${json.data.controllerId}`,
        })
      } else {
        setTestResult({ ok: false, message: json.error ?? "Connection failed" })
      }
    } catch {
      setTestResult({ ok: false, message: "Network error during test" })
    } finally {
      setIsTesting(false)
    }
  }

  const isSasl =
    authType === "sasl_plain" ||
    authType === "sasl_scram_256" ||
    authType === "sasl_scram_512"
  const isSsl = authType === "ssl"

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cf-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="cf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Production Kafka"
          className={cn(errors.name && "border-red-500")}
        />
        {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
      </div>

      {/* Brokers */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cf-brokers">
          Brokers <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="cf-brokers"
          value={brokers}
          onChange={(e) => setBrokers(e.target.value)}
          placeholder={"localhost:9092\nlocalhost:9093"}
          rows={3}
          className={cn(errors.brokers && "border-red-500")}
        />
        <p className="text-xs text-muted-foreground">
          One broker per line or comma-separated
        </p>
        {errors.brokers && <p className="text-xs text-red-500">{errors.brokers}</p>}
      </div>

      {/* Auth Type */}
      <div className="flex flex-col gap-1.5">
        <Label>Auth Type</Label>
        <Select
          value={authType}
          onValueChange={(v) => {
            setAuthType(v as ClusterAuthType)
            setTestResult(null)
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(AUTH_TYPE_LABELS) as ClusterAuthType[]).map((key) => (
              <SelectItem key={key} value={key}>
                {AUTH_TYPE_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* SASL auth config */}
      {isSasl && (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            SASL Credentials
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-sasl-user">
              Username <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cf-sasl-user"
              value={saslUsername}
              onChange={(e) => setSaslUsername(e.target.value)}
              placeholder="kafka-user"
              className={cn(errors.saslUsername && "border-red-500")}
            />
            {errors.saslUsername && (
              <p className="text-xs text-red-500">{errors.saslUsername}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-sasl-pass">Password</Label>
            <Input
              id="cf-sasl-pass"
              type="password"
              value={saslPassword}
              onChange={(e) => setSaslPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>
      )}

      {/* SSL auth config */}
      {isSsl && (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            SSL / TLS Configuration
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-ssl-ca">CA Certificate (PEM)</Label>
            <Textarea
              id="cf-ssl-ca"
              value={sslCa}
              onChange={(e) => setSslCa(e.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----"
              rows={3}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-ssl-cert">Client Certificate (PEM)</Label>
            <Textarea
              id="cf-ssl-cert"
              value={sslCert}
              onChange={(e) => setSslCert(e.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----"
              rows={3}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-ssl-key">Client Key (PEM)</Label>
            <Textarea
              id="cf-ssl-key"
              value={sslKey}
              onChange={(e) => setSslKey(e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY-----"
              rows={3}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="cf-ssl-reject"
              checked={sslRejectUnauthorized}
              onCheckedChange={setSslRejectUnauthorized}
            />
            <Label htmlFor="cf-ssl-reject" className="cursor-pointer">
              Reject unauthorized certificates
            </Label>
          </div>
        </div>
      )}

      <Separator />

      {/* Schema Registry URL */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cf-schema-url">Schema Registry URL</Label>
        <Input
          id="cf-schema-url"
          value={schemaRegistryUrl}
          onChange={(e) => setSchemaRegistryUrl(e.target.value)}
          placeholder="http://localhost:8081"
          type="url"
        />
        <p className="text-xs text-muted-foreground">Optional</p>
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cf-desc">Description</Label>
        <Textarea
          id="cf-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description of this cluster..."
          rows={2}
        />
      </div>

      {/* Global form error */}
      {errors.form && (
        <p className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
          {errors.form}
        </p>
      )}

      {/* Test connection result */}
      {testResult && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
            testResult.ok
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          )}
        >
          {testResult.ok ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleTestConnection}
          disabled={isTesting || isSubmitting}
        >
          {isTesting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testing…
            </>
          ) : (
            "Test Connection"
          )}
        </Button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" variant="blue" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isEdit ? "Saving…" : "Creating…"}
              </>
            ) : isEdit ? (
              "Save Changes"
            ) : (
              "Create Cluster"
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
