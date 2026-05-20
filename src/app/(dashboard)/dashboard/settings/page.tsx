import { Settings, Globe, Palette, Shield } from "lucide-react"
import { getTranslate } from "@/tolgee/server"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { SettingsForm } from "./SettingsForm"

export default async function SettingsPage() {
  const t = await getTranslate()
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/login")
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  })

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Title section */}
      <div className="pb-6 border-b border-border">
        <h1 className="text-3xl font-extrabold tracking-tight font-sans">{t('dashboard.settings.title')}</h1>
        <p className="text-muted-foreground font-sans text-sm mt-1">
          {t('dashboard.settings.description')}
        </p>
      </div>

      {/* Main dashboard body */}
      <div className="grid gap-6 md:grid-cols-4">
        {/* Navigation Sidebar */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1 h-fit md:col-span-1">
          <button className="w-full flex items-center gap-2 text-left font-sans text-sm font-semibold bg-primary/10 text-primary p-3 rounded-lg transition-colors cursor-pointer">
            <Settings className="w-4 h-4" />
            {t('dashboard.settings.nav_general')}
          </button>
          <button className="w-full flex items-center gap-2 text-left font-sans text-sm font-semibold text-muted-foreground p-3 rounded-lg hover:bg-secondary transition-colors cursor-pointer">
            <Globe className="w-4 h-4" />
            {t('dashboard.settings.nav_domain', { defaultValue: "Domain" })}
          </button>
          <button className="w-full flex items-center gap-2 text-left font-sans text-sm font-semibold text-muted-foreground p-3 rounded-lg hover:bg-secondary transition-colors cursor-pointer">
            <Palette className="w-4 h-4" />
            Design & Theme
          </button>
          <button className="w-full flex items-center gap-2 text-left font-sans text-sm font-semibold text-muted-foreground p-3 rounded-lg hover:bg-secondary transition-colors cursor-pointer">
            <Shield className="w-4 h-4" />
            {t('dashboard.settings.nav_security', { defaultValue: "Security" })}
          </button>
        </div>

        {/* Content Pane */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm md:col-span-3 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border/50">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-sans">Media Configuration</h3>
              <p className="text-sm text-muted-foreground font-sans">Manage your public presence and custom branding.</p>
            </div>
          </div>

          <SettingsForm user={user} />
        </div>
      </div>
    </div>
  )
}
