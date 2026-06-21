"use client"

import React from "react"
import { LucideIcon } from "lucide-react"
import { cn } from "@qoe/utils"

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-center md:justify-between pb-6 mb-6 border-b border-zinc-100 dark:border-zinc-800/40", className)}>
      <div className="space-y-1 font-sans">
        <h1 className="text-xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-lg leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
          {actions}
        </div>
      )}
    </div>
  )
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 md:p-12 rounded-xl border border-dashed border-zinc-200/80 bg-zinc-50/20 max-w-2xl mx-auto dark:border-zinc-800/70 dark:bg-zinc-900/10",
        className
      )}
    >
      {/* Lucide Icon with 1.5 stroke width and low contrast */}
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-50 border border-zinc-200/50 text-zinc-350 dark:bg-zinc-900/50 dark:border-zinc-850 dark:text-zinc-650 mb-4 transition-transform duration-300 hover:scale-105">
        <Icon className="h-6 w-6" strokeWidth={1.5} />
      </div>

      <h3 className="font-sans text-sm font-semibold text-zinc-850 dark:text-zinc-200 mb-1">
        {title}
      </h3>
      <p className="font-sans text-xs text-zinc-400 dark:text-zinc-500 max-w-sm mb-6 leading-normal">
        {description}
      </p>

      {action && (
        <div className="flex items-center justify-center gap-2">
          {action}
        </div>
      )}
    </div>
  )
}
