import { prisma } from "@/lib/db"
import { setSystemConfig } from "../actions"

export default async function AdminFrontend() {
  // Fetch existing configs
  const configs = await prisma.systemConfig.findMany({
    where: {
      key: { in: ['GLOBAL_BANNER_ENABLED', 'GLOBAL_BANNER_TEXT', 'GLOBAL_BANNER_LINK'] }
    }
  })
  
  const getConfig = (k: string) => configs.find(c => c.key === k)?.value || ""
  
  const bannerEnabled = getConfig('GLOBAL_BANNER_ENABLED') === 'true'
  const bannerText = getConfig('GLOBAL_BANNER_TEXT')
  const bannerLink = getConfig('GLOBAL_BANNER_LINK')

  async function handleSaveBanner(formData: FormData) {
    "use server"
    const enabled = formData.get("enabled") === "on" ? "true" : "false"
    const text = formData.get("text") as string
    const link = formData.get("link") as string

    await setSystemConfig('GLOBAL_BANNER_ENABLED', enabled, "Active/désactive la bannière globale sur le site")
    await setSystemConfig('GLOBAL_BANNER_TEXT', text, "Texte de la bannière globale")
    await setSystemConfig('GLOBAL_BANNER_LINK', link, "Lien de redirection (optionnel) pour la bannière")
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-12">
      <div className="mb-12">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Frontend</h1>
        <p className="text-neutral-500 mt-2 text-sm">UI & Localization</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
        
        {/* Global Banner */}
        <div className="flex flex-col">
          <div className="mb-8 border-b border-neutral-200 pb-4">
            <h2 className="text-xl font-medium tracking-tight text-neutral-900">Global Banner</h2>
            <p className="text-neutral-500 mt-1 text-sm">Site-wide announcements</p>
          </div>
          
          <form action={handleSaveBanner} className="space-y-6 flex-1 flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">Enable Banner</p>
                <p className="text-xs text-neutral-500 mt-0.5">Displays at the very top of the screen.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" name="enabled" defaultChecked={bannerEnabled} className="sr-only peer" />
                <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#EE4B2B]"></div>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">Announcement Text</label>
              <textarea
                name="text"
                defaultValue={bannerText}
                placeholder="qoe.fi V2 is now live!"
                className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-base font-medium text-neutral-900 focus:border-neutral-900 focus:ring-0 resize-none transition-colors"
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">Optional Link URL</label>
              <input
                type="text"
                name="link"
                defaultValue={bannerLink}
                placeholder="https://qoe.fi/changelog"
                className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-base font-medium text-neutral-900 focus:border-neutral-900 focus:ring-0 transition-colors"
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                className="text-sm font-medium text-neutral-900 hover:text-[#EE4B2B] transition-colors bg-neutral-100 hover:bg-neutral-200 px-4 py-2 rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>

        {/* Translations */}
        <div className="flex flex-col">
          <div className="mb-8 border-b border-neutral-200 pb-4">
            <h2 className="text-xl font-medium tracking-tight text-neutral-900">Translations</h2>
            <p className="text-neutral-500 mt-1 text-sm">Tolgee Integration</p>
          </div>
          
          <div className="space-y-4 text-neutral-600 font-medium text-sm leading-relaxed">
            <p>
              The platform's static texts are managed via the Tolgee Dashboard. No hardcoded strings.
            </p>
            <div className="p-4 bg-neutral-50 border border-neutral-100 rounded-lg font-mono text-xs text-neutral-500">
              {`t("login.manifesto_creators_title")`}
            </div>
            <p className="text-sm text-neutral-500">
              To modify any phrase, log into the Tolgee Dashboard. Changes sync instantly or via export.
            </p>
          </div>

          <div className="pt-8 mt-auto">
            <a
              href="https://app.tolgee.io"
              target="_blank"
              rel="noreferrer"
              className="inline-block text-sm font-medium text-neutral-900 hover:text-[#EE4B2B] transition-colors bg-neutral-100 hover:bg-neutral-200 px-4 py-2 rounded-lg"
            >
              Open Tolgee Dashboard ↗
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}
