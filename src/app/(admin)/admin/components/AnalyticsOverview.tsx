"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts"
import { Calendar, Users, PenTool, Euro, Activity } from "lucide-react"
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
  { id: 'users' as MetricType, label: 'Utilisateurs', icon: Users, format: (v: number) => v.toLocaleString() },
  { id: 'creators' as MetricType, label: 'Créateurs', icon: PenTool, format: (v: number) => v.toLocaleString() },
  { id: 'articles' as MetricType, label: 'Articles', icon: Activity, format: (v: number) => v.toLocaleString() },
  { id: 'revenue' as MetricType, label: 'MRR / Revenus', icon: Euro, format: (v: number) => `${v.toFixed(2)} €` },
]

export function AnalyticsOverview({ data, totals }: AnalyticsOverviewProps) {
  const [activeMetric, setActiveMetric] = useState<MetricType>('users')
  const [dateRange, setDateRange] = useState('30d')

  // Filter data based on dateRange (mocking the filter for now since data passed is 90 days)
  const filteredData = React.useMemo(() => {
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
    return data.slice(-days)
  }, [data, dateRange])

  const activeColor = 
    activeMetric === 'users' ? '#3b82f6' : 
    activeMetric === 'creators' ? '#8b5cf6' : 
    activeMetric === 'articles' ? '#10b981' : 
    '#EE4B2B'

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Analytics</h2>
          <p className="text-neutral-500 text-sm mt-1">Overview of your platform's performance</p>
        </div>
        
        <div className="flex items-center gap-2 bg-neutral-100/80 p-1 rounded-xl border border-neutral-200/60">
          {[
            { id: '7d', label: '7 jours' },
            { id: '30d', label: '30 jours' },
            { id: '90d', label: '3 mois' },
          ].map(range => (
            <button
              key={range.id}
              onClick={() => setDateRange(range.id)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                dateRange === range.id 
                  ? "bg-white text-neutral-900 shadow-sm" 
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200/50"
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards (Clickable) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {METRICS.map(metric => {
          const isActive = activeMetric === metric.id
          return (
            <button
              key={metric.id}
              onClick={() => setActiveMetric(metric.id)}
              className={cn(
                "relative text-left p-6 rounded-[28px] border transition-all duration-300 overflow-hidden group",
                isActive 
                  ? "bg-white border-neutral-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)]" 
                  : "bg-neutral-50/50 border-neutral-100 hover:bg-neutral-50 hover:border-neutral-200"
              )}
            >
              {isActive && (
                <motion.div 
                  layoutId="active-kpi"
                  className="absolute inset-0 border-2 rounded-[28px] pointer-events-none"
                  style={{ borderColor: activeColor, opacity: 0.1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <div className="flex items-center justify-between mb-4">
                <metric.icon 
                  className={cn("w-5 h-5 transition-colors", isActive ? "text-neutral-900" : "text-neutral-400 group-hover:text-neutral-600")} 
                  style={isActive ? { color: activeColor } : {}}
                />
              </div>
              <h3 className="text-sm font-medium text-neutral-500 mb-1">{metric.label}</h3>
              <div className="text-3xl font-bold text-neutral-900 tracking-tight">
                {metric.format(totals[metric.id])}
              </div>
            </button>
          )
        })}
      </div>

      {/* Main Chart */}
      <div className="bg-white border border-neutral-200/60 rounded-[36px] p-6 shadow-2xl h-[420px] flex flex-col relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-neutral-800">
            {METRICS.find(m => m.id === activeMetric)?.label} over time
          </h3>
        </div>
        
        <AnimatePresence mode="wait">
          <motion.div 
            key={activeMetric}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 w-full h-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={filteredData}
                margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id={`color-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={activeColor} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={activeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis
                  dataKey="date"
                  stroke="#a3a3a3"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#a3a3a3"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(1)}k` : value}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#ffffff', 
                    borderColor: '#e5e5e5', 
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                    fontWeight: 500
                  }}
                  itemStyle={{ color: activeColor, fontWeight: 700 }}
                  cursor={{ stroke: activeColor, strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area
                  type="monotone"
                  dataKey={activeMetric}
                  stroke={activeColor}
                  strokeWidth={3}
                  fillOpacity={1}
                  fill={`url(#color-${activeMetric})`}
                  activeDot={{ r: 6, strokeWidth: 0, fill: activeColor }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
