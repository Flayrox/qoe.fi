import { Users, Search } from "lucide-react"
import { getTranslate } from "@/tolgee/server"

export default async function AudiencePage() {
  const t = await getTranslate()

  return (
    <div className="space-y-8">
      {/* Title section */}
      <div className="pb-6 border-b border-border">
        <h1 className="text-3xl font-extrabold tracking-tight font-sans">{t('dashboard.audience.title')}</h1>
        <p className="text-muted-foreground font-sans text-sm mt-1">
          {t('dashboard.audience.description')}
        </p>
      </div>

      {/* Main dashboard body */}
      <div className="grid gap-6 md:grid-cols-4">
        {/* Metric Cards — zeroed out, code-ready */}
        {[
          { label: t('dashboard.metric_subscribers'), value: "0", change: "—" },
          { label: t('dashboard.audience.paid_members'), value: "0", change: "—" },
          { label: t('dashboard.audience.unsubscribes'), value: "0", change: "—" },
          { label: t('dashboard.audience.ltv'), value: "€0.00", change: "—" },
        ].map((metric, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans font-semibold">{metric.label}</span>
            <h2 className="text-3xl font-extrabold">{metric.value}</h2>
            <span className="text-xs text-muted-foreground font-sans">{metric.change}</span>
          </div>
        ))}

        {/* Audience Table Placeholder */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm md:col-span-4 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-secondary border border-border rounded-lg flex items-center justify-center">
                <Users className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-sans">{t('dashboard.audience.subscribers_list')}</h3>
                <p className="text-xs text-muted-foreground font-sans">{t('dashboard.audience.subscribers_list_desc')}</p>
              </div>
            </div>
            {/* Search Box */}
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('dashboard.audience.search_placeholder')}
                className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-2 font-sans text-xs text-foreground focus:outline-none focus:border-ring placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          <div className="h-60 border border-dashed border-border bg-muted/20 rounded-lg flex items-center justify-center text-muted-foreground font-mono text-xs">
            {t('dashboard.audience.table_placeholder')}
          </div>
        </div>
      </div>
    </div>
  )
}
