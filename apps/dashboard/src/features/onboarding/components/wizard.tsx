"use client"

import React, { useState, useEffect, useTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { checkSubdomainAction, completeOnboardingAction } from "../actions"
import { useRouter } from "next/navigation"
import { Loader2, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react"

type WizardData = {
  name: string
  heroText: string
  subdomain: string
  layoutStyle: string
  advancedSettingsMode: boolean
}

export function OnboardingWizard() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  const [step, setStep] = useState(1)
  const [data, setData] = useState<WizardData>({
    name: "",
    heroText: "",
    subdomain: "",
    layoutStyle: "minimal",
    advancedSettingsMode: false,
  })

  // Validation states for Step 2
  const [isCheckingDomain, setIsCheckingDomain] = useState(false)
  const [domainStatus, setDomainStatus] = useState<"idle" | "valid" | "invalid">("idle")
  const [domainError, setDomainError] = useState("")
  const [domainSuggestions, setDomainSuggestions] = useState<string[]>([])

  useEffect(() => {
    // Debounce domain checking
    if (step === 2 && data.subdomain.length >= 3) {
      setDomainStatus("idle")
      setIsCheckingDomain(true)
      const timeout = setTimeout(async () => {
        try {
          const res = await checkSubdomainAction(data.subdomain)
          if (res.available) {
            setDomainStatus("valid")
            setDomainError("")
            setDomainSuggestions([])
          } else {
            setDomainStatus("invalid")
            setDomainError(res.error || "Indisponible")
            setDomainSuggestions(res.suggestions || [])
          }
        } catch (err) {
          setDomainStatus("invalid")
          setDomainError("Erreur de vérification")
        } finally {
          setIsCheckingDomain(false)
        }
      }, 500)
      return () => clearTimeout(timeout)
    } else if (step === 2) {
      setDomainStatus("idle")
      setDomainError("")
      setDomainSuggestions([])
    }
  }, [data.subdomain, step])

  const handleNext = () => {
    if (step === 1 && (!data.name || !data.heroText)) return
    if (step === 2 && domainStatus !== "valid") return
    
    if (step < 5) {
      setStep((s) => s + 1)
    }
    
    if (step === 4) {
      // Trigger final submission
      setStep(5)
      startTransition(async () => {
        try {
          await completeOnboardingAction(data)
          // Wait a bit for aesthetics
          setTimeout(() => {
            router.push("/settings")
          }, 1500)
        } catch (err) {
          console.error(err)
          alert("Une erreur est survenue lors de la création de votre espace.")
          setStep(4)
        }
      })
    }
  }

  const handleBack = () => {
    if (step > 1 && step < 5) setStep((s) => s - 1)
  }

  // Styles for Live Preview based on selected layout
  const previewStyles = {
    minimal: { bg: "#ffffff", text: "#111827", accent: "#c5a880", font: "font-sans" },
    magazine: { bg: "#fdfbf7", text: "#27272a", accent: "#0ea5e9", font: "font-serif" },
    brutalist: { bg: "#000000", text: "#ffffff", accent: "#22c55e", font: "font-mono" },
  }
  const currentPreviewStyle = previewStyles[data.layoutStyle as keyof typeof previewStyles]

  return (
    <div className="flex h-screen w-full bg-white text-neutral-900 overflow-hidden">
      
      {/* Left Column: Form & Interactions */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-24 relative">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-md w-full">
              <h1 className="text-4xl font-light mb-2">Qui es-tu ?</h1>
              <p className="text-neutral-500 mb-8">Commençons par les présentations. C'est ce que tes lecteurs verront en premier.</p>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm text-neutral-500 mb-2">Nom d'affichage</label>
                  <input type="text" placeholder="Ton nom ou pseudo" className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-neutral-900 focus:outline-none focus:border-neutral-400 transition-colors" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm text-neutral-500 mb-2">Courte bio / Accroche</label>
                  <textarea placeholder="De quoi vas-tu parler ?" rows={3} className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-neutral-900 focus:outline-none focus:border-neutral-400 transition-colors resize-none" value={data.heroText} onChange={(e) => setData({ ...data, heroText: e.target.value })} />
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-md w-full">
              <h1 className="text-4xl font-light mb-2">Ton adresse web</h1>
              <p className="text-neutral-400 mb-8">Choisis l'URL où tes lecteurs pourront te trouver.</p>
              
              <div className="space-y-6">
                <div>
                  <div className="flex bg-neutral-50 border border-neutral-200 rounded-lg overflow-hidden focus-within:border-neutral-400 transition-colors">
                    <input type="text" placeholder="mon-super-site" className="flex-1 bg-transparent p-4 text-neutral-900 outline-none" value={data.subdomain} onChange={(e) => setData({ ...data, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
                    <div className="flex items-center px-4 bg-neutral-100 text-neutral-500 border-l border-neutral-200">
                      .qoe.fi
                    </div>
                  </div>
                  
                  {/* Status indicator */}
                  <div className="mt-3 min-h-[24px]">
                    {isCheckingDomain && (
                      <span className="flex items-center text-neutral-400 text-sm">
                        <Loader2 size={14} className="animate-spin mr-2" /> Vérification...
                      </span>
                    )}
                    {!isCheckingDomain && domainStatus === "valid" && (
                      <span className="flex items-center text-green-400 text-sm">
                        <CheckCircle2 size={14} className="mr-2" /> Domaine disponible !
                      </span>
                    )}
                    {!isCheckingDomain && domainStatus === "invalid" && data.subdomain.length >= 3 && (
                      <div className="text-sm">
                        <span className="flex items-center text-red-400 mb-2">
                          <AlertCircle size={14} className="mr-2" /> {domainError}
                        </span>
                        {domainSuggestions.length > 0 && (
                          <div className="mt-2">
                            <span className="text-neutral-400">Suggestions :</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {domainSuggestions.map(s => (
                                <button key={s} onClick={() => setData({ ...data, subdomain: s })} className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs px-3 py-1.5 rounded-full transition-colors">
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-md w-full">
              <h1 className="text-4xl font-light mb-2">L'ambiance</h1>
              <p className="text-neutral-400 mb-8">Sélectionne un style de départ. Ne t'inquiète pas, tu pourras toujours changer plus tard.</p>
              
              <div className="space-y-4">
                {[
                  { id: "minimal", name: "Minimaliste", desc: "Pur, centré sur le texte." },
                  { id: "magazine", name: "Magazine", desc: "Élégant, classique, structuré." },
                  { id: "brutalist", name: "Brutaliste", desc: "Moderne, contrasté, assumé." }
                ].map(style => (
                  <button
                    key={style.id}
                    onClick={() => setData({ ...data, layoutStyle: style.id })}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${data.layoutStyle === style.id ? 'bg-neutral-100 border-neutral-400' : 'bg-neutral-50 border-neutral-200 hover:bg-neutral-100'}`}
                  >
                    <div className="text-lg font-medium">{style.name}</div>
                    <div className="text-neutral-500 text-sm">{style.desc}</div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-md w-full">
              <h1 className="text-4xl font-light mb-2">Le Cockpit</h1>
              <p className="text-neutral-400 mb-8">Comment souhaites-tu gérer ton espace ? (Modifiable à tout moment)</p>
              
              <div className="space-y-4">
                <button
                  onClick={() => setData({ ...data, advancedSettingsMode: false })}
                  className={`w-full text-left p-6 rounded-xl border transition-all ${!data.advancedSettingsMode ? 'bg-neutral-100 border-neutral-400' : 'bg-neutral-50 border-neutral-200 hover:bg-neutral-100'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xl font-medium">Pilote Automatique</div>
                    <span className="bg-neutral-700 text-xs px-2 py-1 rounded">Recommandé</span>
                  </div>
                  <div className="text-neutral-400 text-sm">Concentre-toi uniquement sur l'écriture. Le design et la structure s'adaptent de manière intelligente.</div>
                </button>
                
                <button
                  onClick={() => setData({ ...data, advancedSettingsMode: true })}
                  className={`w-full text-left p-6 rounded-xl border transition-all ${data.advancedSettingsMode ? 'bg-orange-50 border-orange-300' : 'bg-neutral-50 border-neutral-200 hover:bg-neutral-100'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xl font-medium text-orange-600">Mode Manuel (Avancé)</div>
                  </div>
                  <div className="text-neutral-500 text-sm">
                    ⚠️ Conçu pour les médias à grande échelle. Contrôle total sur la navigation, les métadonnées et le CSS. Plus complexe à prendre en main.
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="step5" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center text-center w-full h-full">
              <Loader2 size={48} className="animate-spin text-neutral-500 mb-6" />
              <h1 className="text-3xl font-light mb-4">Construction de ton espace...</h1>
              <p className="text-neutral-400">Préparation du domaine, génération du design, et écriture du premier brouillon.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Controls */}
        {step < 5 && (
          <div className="absolute bottom-8 left-8 sm:left-16 lg:left-24 right-8 sm:right-16 lg:right-24 flex justify-between items-center">
            <button 
              onClick={handleBack} 
              className={`flex items-center text-neutral-500 hover:text-neutral-900 transition-colors ${step === 1 ? 'opacity-0 pointer-events-none' : ''}`}
            >
              <ArrowLeft size={16} className="mr-2" /> Retour
            </button>
            
            <button 
              onClick={handleNext} 
              disabled={
                (step === 1 && (!data.name || !data.heroText)) || 
                (step === 2 && domainStatus !== "valid")
              }
              className="flex items-center bg-neutral-900 text-white px-6 py-3 rounded-full font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {step === 4 ? "Lancer mon espace" : "Continuer"} <ArrowRight size={16} className="ml-2" />
            </button>
          </div>
        )}
      </div>

      {/* Right Column: Live Preview */}
      <div className="hidden lg:flex w-1/2 bg-neutral-900 border-l border-neutral-800 items-center justify-center p-12 relative overflow-hidden">
        {/* Abstract Background pattern */}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-600 via-neutral-900 to-black"></div>
        
        <AnimatePresence mode="popLayout">
          {step < 5 && (
            <motion.div 
              key={data.layoutStyle}
              initial={{ opacity: 0, y: 40, rotateX: 10 }} 
              animate={{ opacity: 1, y: 0, rotateX: 0 }} 
              exit={{ opacity: 0, y: -40, rotateX: -10 }}
              transition={{ duration: 0.5, type: "spring", bounce: 0.3 }}
              className="relative z-10 w-full max-w-lg aspect-[3/4] shadow-2xl rounded-2xl overflow-hidden flex flex-col"
              style={{ 
                backgroundColor: currentPreviewStyle.bg, 
                color: currentPreviewStyle.text,
              }}
            >
              {/* Preview Header */}
              <div className="p-8 pb-4 flex justify-between items-center border-b border-opacity-10 border-current">
                <div className={`text-xl font-bold ${currentPreviewStyle.font}`} style={{ color: currentPreviewStyle.accent }}>
                  {data.name || "Mon Espace"}
                </div>
                <div className="flex gap-4 text-sm opacity-60">
                  <span>Accueil</span>
                  <span>Articles</span>
                </div>
              </div>

              {/* Preview Body */}
              <div className={`p-8 flex-1 flex flex-col justify-center ${currentPreviewStyle.font}`}>
                <motion.h1 
                  layout
                  className={`text-4xl md:text-5xl font-bold mb-6 leading-tight ${data.layoutStyle === 'magazine' ? 'tracking-tight' : ''}`}
                >
                  {data.heroText || "Ceci est le titre de mon média indépendant."}
                </motion.h1>
                <div className="flex items-center gap-4 mt-8">
                  <div className="px-6 py-3 rounded-full text-white font-medium text-sm" style={{ backgroundColor: currentPreviewStyle.accent }}>
                    S'abonner
                  </div>
                  <div className="opacity-60 text-sm">
                    Lire le dernier article
                  </div>
                </div>
              </div>

              {/* Fake Articles List */}
              <div className="p-8 pt-0 flex gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="flex-1 bg-current opacity-5 rounded-lg h-32"></div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
