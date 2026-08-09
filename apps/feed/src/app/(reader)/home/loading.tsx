import React from "react"
import { Skeleton } from "@/components/ui/skeleton"

export default function HomeLoading() {
  return (
    <div className="w-full max-w-2xl mx-auto py-6 px-3 sm:px-4 space-y-6">
      {/* Skeleton En-tête des onglets */}
      <div className="flex items-center gap-4 pb-3 border-b border-border/40">
        <Skeleton className="h-7 w-28 rounded-lg" />
        <Skeleton className="h-7 w-28 rounded-lg" />
        <Skeleton className="h-7 w-28 rounded-lg" />
      </div>

      {/* Skeleton Compositeur */}
      <div className="p-4 border border-border/40 rounded-xl bg-card/50 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-full shrink-0" />
          <Skeleton className="h-9 flex-1 rounded-lg" />
        </div>
        <div className="flex justify-between items-center pt-2">
          <div className="flex gap-2">
            <Skeleton className="w-8 h-8 rounded-md" />
            <Skeleton className="w-8 h-8 rounded-md" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>

      {/* Skeleton Cartes de Pensées (Timeline) */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="py-4 border-b border-border/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-full shrink-0" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-32 rounded-md" />
                <Skeleton className="h-2.5 w-20 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-3.5 w-12 rounded-md" />
          </div>
          <div className="space-y-2 pt-1">
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-4/5 rounded-md" />
          </div>
          <div className="flex justify-between items-center pt-2">
            <Skeleton className="h-4 w-12 rounded-md" />
            <Skeleton className="h-4 w-12 rounded-md" />
            <Skeleton className="h-4 w-12 rounded-md" />
            <Skeleton className="h-4 w-12 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}
