"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { cn } from "@/lib/utils"

interface DailyData {
  date: string
  users: number
  creators: number
  articles: number
  revenue: number
}

interface AnalyticsOverviewProps {
  data: DailyData[]
  totals: {
    users: number
    creators: number
    articles: number
    revenue: number
  }
}

type MetricType = 'users' | 'creators' | 'articles' | 'revenue'

const METRICS = [
  { id: 'users' as MetricType, label: 'Utilisateurs', format: (v: number) => v.toLocaleString() },
  { id: 'creators' as MetricType, label: 'Créateurs', format: (v: number) => v.toLocaleString() },
  { id: 'articles' as MetricType, label: 'Articles', format: (v: number) => v.toLocaleString() },
  { id: 'revenue' as MetricType, label: 'MRR / Revenus', format: (v: number) => `${v.toFixed(2)} €` },
]

export function AnalyticsOverview({ data, totals }: AnalyticsOverviewProps) {
  const [activeMetric, setActiveMetric] = useState<MetricType>('users')

  const activeColor = 
    activeMetric === 'users' ? '#3b82f6' : 
    activeMetric === 'creators' ? '#8b5cf6' : 
    activeMetric === 'articles' ? '#10b981' : 
    '#EE4B2B'

  return (
    <div className="space-y-16 w-full pt-8">
      {/* Editorial KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 relative z-10 px-4 md:px-0">
        {METRICS.map(metric => {
          const isActive = activeMetric === metric.id
          return (
            <button
              key={metric.id}
              onClick={() => setActiveMetric(metric.id)}
              className={cn(
                "group relative text-left flex flex-col items-start focus:outline-none transition-opacity duration-300",
                !isActive ? "opacity-50 hover:opacity-80" : "opacity-100"
              )}
            >
              <div className="text-3xl md:text-4xl font-semibold tracking-tight text-neutral-900">
                {metric.format(totals[metric.id])}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={cn(
                  "text-xs font-medium",
                  isActive ? "text-neutral-900" : "text-neutral-500"
                )}>
                  {metric.label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="active-kpi-dot"
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: activeColor }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Pure Data Spline */}
      <div className="h-[300px] md:h-[400px] w-full relative -mx-4 md:-mx-8 lg:-mx-12 px-4 md:px-8 lg:px-12 overflow-visible pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div 
            key={activeMetric}
            initial={{ opacity: 0, scaleY: 0.95 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0.95 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-full h-full pointer-events-auto"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={`color-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={activeColor} stopOpacity={0.08} />
                    <stop offset="100%" stopColor={activeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255,255,255,0.9)', 
                    backdropFilter: 'blur(8px)',
                    borderColor: 'transparent', 
                    borderRadius: '16px',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.05)',
                    padding: '12px 20px',
                    fontFamily: 'inherit'
                  }}
                  itemStyle={{ color: '#171717', fontWeight: 500, fontSize: '14px' }}
                  labelStyle={{ color: '#a3a3a3', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}
                  cursor={{ stroke: activeColor, strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area
                  type="monotone"
                  dataKey={activeMetric}
                  stroke={activeColor}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#color-${activeMetric})`}
                  activeDot={{
                    r: 6,
                    strokeWidth: 4,
                    fill: '#fff',
                    stroke: activeColor,
                    style: { filter: `drop-shadow(0px 0px 8px ${activeColor})` }
                  }}
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
