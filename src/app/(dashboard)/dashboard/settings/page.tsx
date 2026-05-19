import { Settings } from "lucide-react"
import { getTranslate } from "@/tolgee/server"

export default async function SettingsPage() {
  const t = await getTranslate()

  return (
    <div className="space-y-8">
      {/* Title section */}
      <div className="pb-6 border-b border-border">
        <h1 className="text-3xl font-extrabold tracking-tight font-sans">{t('dashboard.settings.title')}</h1>
        <p className="text-muted-foreground font-sans text-sm mt-1">
          {t('dashboard.settings.description')}
        </p>
      </div>

      {/* Main dashboard body */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Navigation Sidebar */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-3">
          <button className="w-full text-left font-sans text-xs font-semibold bg-primary text-primary-foreground p-3 rounded-lg transition-colors cursor-pointer">
            {t('dashboard.settings.nav_general')}
          </button>
          <button className="w-full text-left font-sans text-xs font-semibold bg-secondary text-secondary-foreground p-3 rounded-lg border border-border/40 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
            {t('dashboard.settings.nav_domain')}
          </button>
          <button className="w-full text-left font-sans text-xs font-semibold bg-secondary text-secondary-foreground p-3 rounded-lg border border-border/40 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
            {t('dashboard.settings.nav_api')}
          </button>
          <button className="w-full text-left font-sans text-xs font-semibold bg-secondary text-secondary-foreground p-3 rounded-lg border border-border/40 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
            {t('dashboard.settings.nav_security')}
          </button>
        </div>

        {/* Content Pane */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm md:col-span-2 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border/50">
            <div className="h-10 w-10 bg-secondary border border-border rounded-lg flex items-center justify-center">
              <Settings className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-sans">{t('dashboard.settings.general_title')}</h3>
              <p className="text-xs text-muted-foreground font-sans">{t('dashboard.settings.general_description')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-sans font-semibold">{t('dashboard.settings.label_pub_name')}</label>
              <input
                type="text"
                defaultValue="qoe.fi"
                className="w-full bg-secondary/30 border border-border rounded-lg p-3 font-sans text-sm text-foreground focus:outline-none focus:border-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-sans font-semibold">{t('dashboard.settings.label_email')}</label>
              <input
                type="email"
                defaultValue="hello@qoe.fi"
                className="w-full bg-secondary/30 border border-border rounded-lg p-3 font-sans text-sm text-foreground focus:outline-none focus:border-ring"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
