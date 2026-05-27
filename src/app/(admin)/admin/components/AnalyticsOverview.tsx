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
    activeMetric === 'users' ? '#EE4B2B' : // Vermillon Brand
    activeMetric === 'creators' ? '#F97316' : // Orange Accent
    activeMetric === 'articles' ? '#18181B' : // Zinc-900
    '#D97706' // Warm Golden Amber

  return (
    <div className="space-y-12 w-full pt-6">
      {/* Editorial KPIs (Bento Grid Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10 px-4 md:px-0">
        {METRICS.map(metric => {
          const isActive = activeMetric === metric.id
          return (
            <button
              key={metric.id}
              onClick={() => setActiveMetric(metric.id)}
              className={cn(
                "group relative text-left flex flex-col items-start p-5 rounded-[20px] border transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 outline-none cursor-pointer",
                isActive 
                  ? "bg-white border-neutral-200/80 shadow-sm" 
                  : "bg-neutral-50/50 border-neutral-200/40 opacity-70 hover:opacity-100 hover:bg-neutral-100/40"
              )}
            >
              <div className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900 group-hover:scale-[1.01] transition-transform duration-300">
                {metric.format(totals[metric.id])}
              </div>
              <div className="mt-3 flex items-center justify-between w-full">
                <span className="text-[10px] font-bold text-neutral-400 font-mono uppercase tracking-wider">
                  {metric.label}
                </span>
                <div 
                  className={cn(
                    "w-2 h-2 rounded-full transition-all duration-300",
                    isActive ? "scale-120" : "scale-50 opacity-40 group-hover:scale-75 group-hover:opacity-100"
                  )}
                  style={{ backgroundColor: isActive ? activeColor : "#A3A3A3" }}
                />
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
            initial={{ opacity: 0, scaleY: 0.97 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0.97 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="w-full h-full pointer-events-auto"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={`color-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={activeColor} stopOpacity={0.06} />
                    <stop offset="100%" stopColor={activeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255,255,255,0.92)', 
                    backdropFilter: 'blur(12px)',
                    borderColor: 'rgba(229,229,229,0.8)', 
                    borderRadius: '20px',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.06)',
                    padding: '14px 20px',
                    fontFamily: 'inherit'
                  }}
                  itemStyle={{ color: '#171717', fontWeight: 600, fontSize: '13px' }}
                  labelStyle={{ color: '#a3a3a3', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, fontFamily: 'monospace', marginBottom: '6px' }}
                  cursor={{ stroke: activeColor, strokeWidth: 1.5, strokeDasharray: '4 4' }}
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
                  animationDuration={1000}
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
