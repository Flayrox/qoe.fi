import { Send, Award } from "lucide-react"
import { getTranslate } from "@/tolgee/server"

export default async function NewslettersPage() {
  const t = await getTranslate()

  return (
    <div className="space-y-8">
      {/* Title section */}
      <div className="pb-6 border-b border-border">
        <h1 className="text-3xl font-extrabold tracking-tight font-sans">{t('dashboard.newsletters.title')}</h1>
        <p className="text-muted-foreground font-sans text-sm mt-1">
          {t('dashboard.newsletters.description')}
        </p>
      </div>

      {/* Main dashboard body */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Campaign Status Card */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm md:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-secondary border border-border rounded-lg flex items-center justify-center">
              <Send className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-sans">{t('dashboard.newsletters.active_campaigns')}</h3>
              <p className="text-xs text-muted-foreground font-sans">{t('dashboard.newsletters.no_drafts')}</p>
            </div>
          </div>
          <div className="h-40 border border-dashed border-border bg-muted/20 rounded-lg flex items-center justify-center text-muted-foreground font-mono text-xs">
            {t('dashboard.newsletters.drafts_placeholder')}
          </div>
        </div>

        {/* Deliverability Stats */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-secondary border border-border rounded-lg flex items-center justify-center">
              <Award className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-sans">{t('dashboard.newsletters.reputation')}</h3>
              <p className="text-xs text-muted-foreground font-sans">{t('dashboard.newsletters.reputation_desc')}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between font-mono text-xs mb-1.5 text-secondary-foreground">
                <span>{t('dashboard.newsletters.deliverability')}</span>
                <span className="font-bold">—</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border/60">
                <div className="bg-emerald-500 h-full rounded-full w-0 transition-all duration-500"></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between font-mono text-xs mb-1.5 text-secondary-foreground">
                <span>{t('dashboard.newsletters.ip_health')}</span>
                <span className="font-bold">—</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border/60">
                <div className="bg-emerald-500 h-full rounded-full w-0 transition-all duration-500"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
