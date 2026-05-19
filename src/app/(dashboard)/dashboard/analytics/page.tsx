import { BarChart3, Compass } from "lucide-react"
import { getTranslate } from "@/tolgee/server"

export default async function AnalyticsPage() {
  const t = await getTranslate()

  return (
    <div className="space-y-8">
      {/* Title section */}
      <div className="pb-6 border-b border-border">
        <h1 className="text-3xl font-extrabold tracking-tight font-sans">{t('dashboard.analytics.title')}</h1>
        <p className="text-muted-foreground font-sans text-sm mt-1">
          {t('dashboard.analytics.description')}
        </p>
      </div>

      {/* Main dashboard body */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Performance Overview */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm md:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-secondary border border-border rounded-lg flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-sans">{t('dashboard.analytics.audience_growth')}</h3>
              <p className="text-xs text-muted-foreground font-sans">{t('dashboard.analytics.audience_growth_desc')}</p>
            </div>
          </div>
          <div className="h-64 border border-dashed border-border bg-muted/20 rounded-lg flex items-center justify-center text-muted-foreground font-mono text-xs">
            {t('dashboard.analytics_placeholder')}
          </div>
        </div>

        {/* Traffic Sources */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-secondary border border-border rounded-lg flex items-center justify-center">
              <Compass className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-sans">{t('dashboard.analytics.top_channels')}</h3>
              <p className="text-xs text-muted-foreground font-sans">{t('dashboard.analytics.top_channels_desc')}</p>
            </div>
          </div>
          <div className="space-y-4">
            {[
              { name: "Direct Search", pct: "—" },
              { name: "Social", pct: "—" },
              { name: "Referrals", pct: "—" },
              { name: "Other", pct: "—" },
            ].map((channel, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
                <span className="font-sans text-xs text-secondary-foreground">{channel.name}</span>
                <span className="font-mono text-xs font-bold">{channel.pct}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
