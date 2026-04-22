import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:     "border-blue-500/30   bg-blue-500/15   text-blue-400",
        secondary:   "border-gray-500/30   bg-gray-500/15   text-gray-400",
        success:     "border-green-500/30  bg-green-500/15  text-green-400",
        warning:     "border-yellow-500/30 bg-yellow-500/15 text-yellow-400",
        error:       "border-red-500/30    bg-red-500/15    text-red-400",
        destructive: "border-red-500/30    bg-red-500/15    text-red-400",
        outline:     "border-border        bg-transparent   text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
