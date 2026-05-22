import { prisma } from "@/lib/db"
import { LayoutTemplate, Globe, Languages, Save } from "lucide-react"
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
    <div className="max-w-6xl mx-auto space-y-8 font-sans">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-neutral-100 border border-neutral-200/60 rounded-[28px] text-neutral-900 shadow-sm">
          <LayoutTemplate className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Frontend & Interface</h1>
          <p className="text-neutral-500 mt-1 text-sm">Gérez l'apparence globale et les traductions de qoe.fi.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Global Banner Card */}
        <div className="bg-white border border-neutral-200/60 rounded-[36px] p-6 shadow-2xl flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Globe className="w-5 h-5 text-[#EE4B2B]" />
            <h2 className="text-lg font-bold text-neutral-900">Bannière Globale (Annonces)</h2>
          </div>
          
          <form action={handleSaveBanner} className="space-y-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-200/60 rounded-xl">
              <div>
                <p className="text-sm font-semibold text-neutral-900">Activer la bannière</p>
                <p className="text-xs text-neutral-500">S'affichera tout en haut de l'écran.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" name="enabled" defaultChecked={bannerEnabled} className="sr-only peer" />
                <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#EE4B2B]"></div>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Texte de l'annonce</label>
              <textarea 
                name="text"
                defaultValue={bannerText}
                placeholder="Ex: qoe.fi V2 est maintenant en ligne ! Découvrez les nouveautés..." 
                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm text-neutral-900 focus:border-neutral-300 focus:outline-none resize-none shadow-sm"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Lien (URL optionnelle)</label>
              <input 
                type="text" 
                name="link"
                defaultValue={bannerLink}
                placeholder="https://qoe.fi/changelog" 
                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm text-neutral-900 focus:border-neutral-300 focus:outline-none shadow-sm"
              />
            </div>

            <div className="mt-auto pt-4 flex justify-end">
              <button 
                type="submit" 
                className="bg-[#EE4B2B] text-white px-6 py-2 rounded-xl font-bold hover:bg-[#d63f22] transition-colors text-sm flex items-center gap-2 shadow-sm"
              >
                <Save className="w-4 h-4" /> Mettre à jour
              </button>
            </div>
          </form>
        </div>

        {/* Translations Card */}
        <div className="bg-white border border-neutral-200/60 rounded-[36px] p-6 shadow-2xl flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Languages className="w-5 h-5 text-[#EE4B2B]" />
            <h2 className="text-lg font-bold text-neutral-900">Traductions (Tolgee)</h2>
          </div>
          
          <div className="space-y-4 text-neutral-600 text-sm leading-relaxed">
            <p>
              L'intégralité des textes statiques de l'interface (boutons, placeholders, menus, manifestes) n'est plus codée en dur ("hardcoded").
            </p>
            <div className="p-4 bg-neutral-50 border border-neutral-200/60 rounded-xl font-mono text-xs text-neutral-500">
              {`// Exemple de clé de traduction
t("login.manifesto_creators_title")`}
            </div>
            <p>
              Pour modifier une phrase sur la plateforme, connectez-vous au <strong>Dashboard Tolgee</strong> du projet. Toute modification effectuée là-bas sera instantanément synchronisée ou nécessitera juste un export des fichiers <code>fr.json</code> et <code>en.json</code>.
            </p>
          </div>

          <div className="mt-auto pt-6">
            <a 
              href="https://app.tolgee.io" 
              target="_blank" 
              rel="noreferrer"
              className="block w-full text-center bg-neutral-100 border border-neutral-200/60 text-neutral-900 px-6 py-2.5 rounded-xl font-bold hover:bg-neutral-200 transition-colors text-sm"
            >
              Ouvrir le Dashboard Tolgee
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}
