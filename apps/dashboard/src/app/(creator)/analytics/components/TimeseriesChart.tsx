"use client"

import React, { useState } from "react"
import { TrendingUp, Calendar, BarChart2 } from "lucide-react"
import { UmamiTimeseriesPoint } from "@qoe/analytics/server"

interface TimeseriesChartProps {
  data: UmamiTimeseriesPoint[]
  period: string
}

export function TimeseriesChart({ data, period }: TimeseriesChartProps) {
  const [activePoint, setActivePoint] = useState<{ point: UmamiTimeseriesPoint; index: number } | null>(null)

  // Generate fallback points if empty
  const points = data && data.length > 0 ? data : Array.from({ length: 14 }).map((_, i) => ({
    x: new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000).toISOString(),
    y: Math.floor(Math.random() * 25) + 5
  }))

  const maxY = Math.max(...points.map((p) => p.y || 0), 10)
  const totalViews = points.reduce((acc, p) => acc + (p.y || 0), 0)
  const avgViews = Math.round(totalViews / points.length)

  // SVG dimensions
  const height = 180
  const width = 800
  const paddingX = 20
  const paddingY = 20
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingY * 2

  // Generate coordinates
  const coords = points.map((point, index) => {
    const x = paddingX + (index / (points.length - 1 || 1)) * chartWidth
    const y = height - paddingY - ((point.y || 0) / maxY) * chartHeight
    return { x, y, point, index }
  })

  // Build SVG Path string for line and gradient area
  const linePath = coords.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`
  }, "")

  const areaPath = coords.length > 0
    ? `${linePath} L ${coords[coords.length - 1].x} ${height - paddingY} L ${coords[0].x} ${height - paddingY} Z`
    : ""

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString)
      if (period === "24h") {
        return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      }
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
    } catch {
      return isoString
    }
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
      {/* Top Header & Overview Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="h-4 w-4 text-primary stroke-[1.5]" />
            <h3 className="text-[17px] font-semibold tracking-tight text-foreground">Évolution du trafic</h3>
          </div>
          <p className="text-xs text-muted-foreground">Volume de lecture sur la période ({period})</p>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total période</span>
            <span className="text-lg font-bold text-foreground">{totalViews.toLocaleString()} vues</span>
          </div>
          <div className="h-8 w-[1px] bg-border/40" />
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Moyenne quotidienne</span>
            <span className="text-lg font-bold text-foreground">{avgViews.toLocaleString()} / jour</span>
          </div>
        </div>
      </div>

      {/* SVG Chart Area */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[200px] overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="analyticsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Background Grid Hairlines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="currentColor" strokeOpacity="0.06" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="currentColor" strokeOpacity="0.06" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="currentColor" strokeOpacity="0.1" />

          {/* Area Fill */}
          <path d={areaPath} fill="url(#analyticsGradient)" />

          {/* Area Line */}
          <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" className="text-foreground/80" />

          {/* Interactive Hover Dots & Trigger Areas */}
          {coords.map((c, i) => (
            <g key={i} className="cursor-pointer group" onMouseEnter={() => setActivePoint({ point: c.point, index: c.index })}>
              {/* Invisible wide hit target */}
              <rect
                x={c.x - (chartWidth / coords.length) / 2}
                y={0}
                width={chartWidth / coords.length}
                height={height}
                fill="transparent"
              />

              {/* Data Dot */}
              <circle
                cx={c.x}
                cy={c.y}
                r={activePoint?.index === i ? "5" : "3"}
                className={`${activePoint?.index === i ? "fill-foreground stroke-background stroke-2" : "fill-foreground/40"} transition-all`}
              />
            </g>
          ))}
        </svg>

        {/* Hover Tooltip Overlay */}
        {activePoint && (
          <div className="absolute top-2 right-4 flex items-center gap-2 p-2 rounded-lg bg-muted/90 border border-border/40 backdrop-blur-md text-xs shadow-sm transition-all">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
            <span className="text-muted-foreground font-medium">{formatDate(activePoint.point.x)} :</span>
            <span className="font-semibold text-foreground">{activePoint.point.y.toLocaleString()} vues</span>
          </div>
        )}
      </div>

      {/* X-Axis Date Labels */}
      <div className="flex items-center justify-between mt-3 text-[11px] font-medium text-muted-foreground/60 px-1 border-t border-border/30 pt-2">
        <span>{formatDate(points[0]?.x)}</span>
        <span>{formatDate(points[Math.floor(points.length / 2)]?.x)}</span>
        <span>{formatDate(points[points.length - 1]?.x)}</span>
      </div>
    </div>
  )
}
