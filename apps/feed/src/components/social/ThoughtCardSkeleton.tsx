import React from 'react';

export function ThoughtCardSkeleton() {
  return (
    <div className="w-full rounded-2xl border border-border/50 bg-card p-4 sm:p-5 shadow-sm space-y-3 animate-pulse">
      {/* Header: Avatar + Author Info */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted/60" />
        <div className="space-y-1.5 flex-1">
          <div className="h-4 w-32 rounded bg-muted/60" />
          <div className="h-3 w-20 rounded bg-muted/40" />
        </div>
      </div>

      {/* Content lines */}
      <div className="space-y-2 pt-1">
        <div className="h-4 w-11/12 rounded bg-muted/50" />
        <div className="h-4 w-3/4 rounded bg-muted/40" />
      </div>

      {/* Action Row */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <div className="h-4 w-12 rounded bg-muted/30" />
        <div className="h-4 w-12 rounded bg-muted/30" />
        <div className="h-4 w-12 rounded bg-muted/30" />
        <div className="h-4 w-12 rounded bg-muted/30" />
      </div>
    </div>
  );
}
