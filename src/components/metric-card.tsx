import * as React from "react"
import { cn } from "@/lib/utils"

interface MetricCardProps {
  title: string
  value: number | string | null | undefined
  icon: React.ReactNode
  description?: string
  className?: string
}

export function MetricCard({
  title,
  value,
  icon,
  description,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-[#1F2937] bg-[#111827] px-5 py-4",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B0F19] text-blue-400">
          {icon}
        </span>
      </div>
      <div>
        <span className="text-3xl font-semibold tabular-nums text-white">
          {value ?? "—"}
        </span>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  )
}
