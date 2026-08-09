"use client"

import React, { useState } from "react"
import { Laptop, Smartphone, Tablet, Globe, Monitor, Compass } from "lucide-react"
import { UmamiPageMetric } from "@qoe/analytics/server"

interface DevicesAndGeoBlockProps {
  devices: UmamiPageMetric[]
  browsers: UmamiPageMetric[]
  countries: UmamiPageMetric[]
}

type MetricTab = "devices" | "browsers" | "countries"

const countryNames: Record<string, string> = {
  FR: "France",
  US: "États-Unis",
  GB: "Royaume-Uni",
  CA: "Canada",
  DE: "Allemagne",
  BE: "Belgique",
  CH: "Suisse",
  ES: "Espagne",
  IT: "Italie",
  NL: "Pays-Bas"
}

export function DevicesAndGeoBlock({ devices, browsers, countries }: DevicesAndGeoBlockProps) {
  const [activeTab, setActiveTab] = useState<MetricTab>("devices")

  const getTabData = () => {
    if (activeTab === "devices") return devices
    if (activeTab === "browsers") return browsers
    return countries
  }

  const currentData = getTabData()
  const maxVal = currentData.length > 0 ? Math.max(...currentData.map((d) => d.y)) : 1

  const formatItemTitle = (rawKey: string) => {
    if (activeTab === "countries") {
      return countryNames[rawKey.toUpperCase()] || rawKey
    }
    if (!rawKey || rawKey === "desktop") return "Ordinateur (Desktop)"
    if (rawKey === "mobile") return "Mobile / Smartphone"
    if (rawKey === "tablet") return "Tablette"
    return rawKey
  }

  const getItemIcon = (rawKey: string) => {
    if (activeTab === "countries") return <Globe className="h-4 w-4 stroke-[1.5]" />
    if (rawKey === "mobile") return <Smartphone className="h-4 w-4 stroke-[1.5]" />
    if (rawKey === "tablet") return <Tablet className="h-4 w-4 stroke-[1.5]" />
    return <Laptop className="h-4 w-4 stroke-[1.5]" />
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
      {/* Tab Switcher Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight text-foreground">Appareils & Audience</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Répartition technique et géographique de vos lecteurs</p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40 border border-border/30">
          {(
            [
              { id: "devices", label: "Appareils" },
              { id: "browsers", label: "Navigateurs" },
              { id: "countries", label: "Pays" }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-card text-foreground font-semibold shadow-sm border border-border/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bar List */}
      {currentData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg border-border/30 bg-muted/10">
          <Monitor className="h-6 w-6 text-muted-foreground/40 mb-2 stroke-[1.5]" />
          <p className="text-xs font-medium text-muted-foreground">Aucune donnée pour cet indicateur</p>
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {currentData.map((item, index) => {
            const percentage = Math.round((item.y / maxVal) * 100)
            const title = formatItemTitle(item.x)

            return (
              <div
                key={item.x || index}
                className="group relative flex flex-col justify-center h-14 px-3 -mx-3 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
                      {getItemIcon(item.x)}
                    </div>
                    <span className="font-medium text-foreground text-sm truncate">{title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-semibold text-foreground text-sm">{item.y.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">lecteurs</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-transparent">
                  <div
                    className="h-full bg-blue-500/40 rounded-full transition-all duration-300 group-hover:bg-blue-500/70"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
