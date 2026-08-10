"use client"

import React, { useState, useEffect, useTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { checkSubdomainAvailabilityAction as checkSubdomainAction, completeOnboardingAction } from "@qoe/api-client/actions/dashboard"

import { useRouter } from "next/navigation"
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Home,
  FileText,
  Mail,
  Users,
  BarChart3,
  Settings,
  Plus
} from "lucide-react"
import { BentoPlateau, BentoItem } from "@qoe/ui/ui/BentoPlateau"

type WizardData = {
  name: string
  heroText: string
  subdomain: string
  layoutStyle: string
  advancedSettingsMode: boolean
}

function MockDashboard() {
  return (
    <div className="absolute inset-0 w-full h-full bg-[#FCFBF9] flex overflow-hidden select-none pointer-events-none opacity-[0.22] dark:opacity-[0.1]">
      {/* Sidebar Mock */}
      <div className="w-64 border-r border-neutral-200/60 bg-white flex flex-col p-6 gap-6 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded bg-[#EE4B2B] flex items-center justify-center text-white font-serif font-black text-xs">q</div>
          <span className="font-sans text-sm font-semibold tracking-tight text-neutral-800">qoe.fi</span>
          <span className="text-[9px] uppercase tracking-wider bg-neutral-100 text-neutral-500 font-bold px-1.5 py-0.5 rounded">
            Console
          </span>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="text-[9px] uppercase font-bold tracking-wider text-neutral-400 mb-2 px-3">Plateforme</span>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-neutral-100 text-neutral-800 text-xs font-semibold">
            <Home size={15} className="text-neutral-500" /> Vue d'ensemble
          </div>
          {[
            { name: "Écrits", icon: FileText },
            { name: "Newsletters", icon: Mail },
            { name: "Audience", icon: Users },
            { name: "Statistiques", icon: BarChart3 },
            { name: "Réglages", icon: Settings },
          ].map((item) => (
            <div key={item.name} className="flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-400 text-xs font-medium">
              <item.icon size={15} className="text-neutral-300" /> {item.name}
            </div>
          ))}
        </div>
      </div>
      
      {/* Main Content Mock */}
      <div className="flex-1 flex flex-col">
        {/* Header Mock */}
        <div className="h-16 border-b border-neutral-200/50 bg-white px-8 flex items-center justify-between">
          <div className="text-xs text-neutral-400 font-medium">Plateforme / Vue d'ensemble</div>
          <div className="w-8 h-8 rounded-full bg-neutral-200" />
        </div>
        
        {/* Content Body Mock */}
        <div className="p-8 flex flex-col gap-6 flex-1">
          <div className="flex items-center justify-between">
            <div className="h-6 w-36 bg-neutral-200 rounded" />
            <div className="h-9 w-24 bg-neutral-100 rounded-lg flex items-center justify-center text-xs text-neutral-300 gap-1">
              <Plus size={14} /> Nouveau
            </div>
          </div>
          
          {/* Stats Cards Grid Mock */}
          <div className="grid grid-cols-3 gap-6">
            {[
              { label: "Audience totale", value: "1,248", change: "+12%" },
              { label: "Taux d'ouverture", value: "68.4%", change: "+3.2%" },
              { label: "Revenus (MRR)", value: "450 €", change: "+8%" }
            ].map((card, i) => (
              <div key={i} className="p-6 bg-white border border-neutral-200/60 rounded-xl flex flex-col gap-2">
                <span className="text-xs text-neutral-400 font-medium">{card.label}</span>
                <span className="text-2xl font-bold text-neutral-800">{card.value}</span>
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 self-start px-2 py-0.5 rounded">{card.change}</span>
              </div>
            ))}
          </div>
          
          {/* Chart & Activity Mock */}
          <div className="grid grid-cols-3 gap-6 flex-1 min-h-0">
            <div className="col-span-2 p-6 bg-white border border-neutral-200/60 rounded-xl flex flex-col gap-4">
              <div className="h-4 w-28 bg-neutral-200 rounded" />
              <div className="flex-1 w-full bg-neutral-50 rounded-lg border border-neutral-100 flex items-end p-4 gap-3">
                {/* Simulated Chart Bars */}
                {[30, 45, 35, 60, 40, 75, 50, 90, 65, 85, 70, 95].map((h, i) => (
                  <div key={i} className="flex-1 bg-[#EE4B2B]/20 hover:bg-[#EE4B2B]/30 rounded-t transition-all" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            
            <div className="p-6 bg-white border border-neutral-200/60 rounded-xl flex flex-col gap-4">
              <div className="h-4 w-28 bg-neutral-200 rounded" />
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-100 shrink-0" />
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="h-3 w-20 bg-neutral-200 rounded" />
                      <div className="h-2 w-12 bg-neutral-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
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
          if (res.ok && res.data.available) {
            setDomainStatus("valid")
            setDomainError("")
            setDomainSuggestions([])
          } else {
            setDomainStatus("invalid")
            setDomainError(res.ok ? (res.data.reason || "Indisponible") : (res.error?.message || "Indisponible"))
            setDomainSuggestions([])
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
    magazine: { bg: "#fdfbf7", text: "#27272a", accent: "#EE4B2B", font: "font-serif" },
    brutalist: { bg: "#000000", text: "#ffffff", accent: "#22c55e", font: "font-mono" },
  }
  const currentPreviewStyle = previewStyles[data.layoutStyle as keyof typeof previewStyles]

  return (
    <div className="relative flex h-screen w-full bg-[#FCFBF9] text-neutral-900 overflow-hidden font-sans items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Background with Mock Dashboard and Blur */}
      <MockDashboard />
      <div className="absolute inset-0 z-10 bg-neutral-950/[0.02] backdrop-blur-[3.5px]" />

      <div className="relative z-20 w-full max-w-[95%] xl:max-w-6xl mx-auto animate-in fade-in zoom-in duration-500">
        <BentoPlateau className="min-h-[580px] md:h-[640px]">
          {/* Left Side: Onboarding Form (Active) */}
          <BentoItem
            active={true}
            flexBasisActive="58%"
            innerClassName="bg-white text-neutral-900"
          >
            <div className="w-full h-full flex flex-col justify-between p-8 md:p-12 relative min-h-[500px]">
              {/* Top qoe.fi signature */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EE4B2B] animate-pulse" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400">qoe.fi · Studio Setup</span>
              </div>

              {/* Form step contents */}
              <div className="flex-1 flex flex-col justify-center py-6">
                <AnimatePresence mode="wait">
                  {step === 1 && (
                    <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="max-w-md w-full">
                      <h1 className="text-3xl md:text-4xl font-serif font-bold text-neutral-900 mb-2 tracking-tight">Qui es-tu ?</h1>
                      <p className="text-neutral-500 mb-8 text-sm leading-relaxed">Commençons par les présentations. C'est ce que tes lecteurs verront en premier sur ton espace d'écriture.</p>
                      
                      <div className="space-y-6">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Nom d'affichage</label>
                          <input type="text" placeholder="Ton nom ou pseudo" className="w-full bg-[#FAF9F6] border border-neutral-200 rounded-lg p-4 text-neutral-900 focus:outline-none focus:border-[#EE4B2B] focus:ring-1 focus:ring-[#EE4B2B] transition-all" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Courte bio / Accroche</label>
                          <textarea placeholder="De quoi vas-tu parler ?" rows={3} className="w-full bg-[#FAF9F6] border border-neutral-200 rounded-lg p-4 text-neutral-900 focus:outline-none focus:border-[#EE4B2B] focus:ring-1 focus:ring-[#EE4B2B] transition-all resize-none" value={data.heroText} onChange={(e) => setData({ ...data, heroText: e.target.value })} />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="max-w-md w-full">
                      <h1 className="text-3xl md:text-4xl font-serif font-bold text-neutral-900 mb-2 tracking-tight">Ton adresse web</h1>
                      <p className="text-neutral-500 mb-8 text-sm leading-relaxed">Choisis l'adresse unique (sous-domaine) où tes abonnés pourront te lire.</p>
                      
                      <div className="space-y-6">
                        <div>
                          <div className="flex bg-[#FAF9F6] border border-neutral-200 rounded-lg overflow-hidden focus-within:border-[#EE4B2B] focus-within:ring-1 focus-within:ring-[#EE4B2B] transition-all">
                            <input type="text" placeholder="mon-super-site" className="flex-1 bg-transparent p-4 text-neutral-900 outline-none" value={data.subdomain} onChange={(e) => setData({ ...data, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
                            <div className="flex items-center px-4 bg-neutral-100 text-neutral-500 border-l border-neutral-200 font-medium">
                              .qoe.fi
                            </div>
                          </div>
                          
                          {/* Status indicator */}
                          <div className="mt-3 min-h-[24px]">
                            {isCheckingDomain && (
                              <span className="flex items-center text-neutral-400 text-xs">
                                <Loader2 size={14} className="animate-spin mr-2" /> Vérification de la disponibilité...
                              </span>
                            )}
                            {!isCheckingDomain && domainStatus === "valid" && (
                              <span className="flex items-center text-emerald-600 text-xs font-medium">
                                <CheckCircle2 size={14} className="mr-2" /> Cette adresse est libre et t'attend !
                              </span>
                            )}
                            {!isCheckingDomain && domainStatus === "invalid" && data.subdomain.length >= 3 && (
                              <div className="text-xs">
                                <span className="flex items-center text-[#EE4B2B] mb-2 font-medium">
                                  <AlertCircle size={14} className="mr-2" /> {domainError}
                                </span>
                                {domainSuggestions.length > 0 && (
                                  <div className="mt-2">
                                    <span className="text-neutral-400">Pourquoi pas une de celles-ci ?</span>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      {domainSuggestions.map(s => (
                                        <button key={s} onClick={() => setData({ ...data, subdomain: s })} className="bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs px-3 py-1.5 rounded-full transition-colors border border-neutral-200">
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
                    <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="max-w-md w-full">
                      <h1 className="text-3xl md:text-4xl font-serif font-bold text-neutral-900 mb-2 tracking-tight">L'ambiance</h1>
                      <p className="text-neutral-500 mb-8 text-sm leading-relaxed">Sélectionne le design de départ pour ton espace. Modifiable à tout moment.</p>
                      
                      <div className="space-y-4">
                        {[
                          { id: "minimal", name: "Minimaliste", desc: "Design puriste, centré exclusivement sur la force du texte." },
                          { id: "magazine", name: "Magazine", desc: "Édition classique, élégance littéraire avec empattement." },
                          { id: "brutalist", name: "Brutaliste", desc: "Moderne, contrasté, néon et sans compromis." }
                        ].map(style => (
                          <button
                            key={style.id}
                            onClick={() => setData({ ...data, layoutStyle: style.id })}
                            className={`w-full text-left p-4 rounded-xl border transition-all ${data.layoutStyle === style.id ? 'bg-[#FAF9F6] border-[#EE4B2B] shadow-sm' : 'bg-white border-neutral-200 hover:bg-[#FAF9F6]'}`}
                          >
                            <div className="text-base font-semibold text-neutral-900">{style.name}</div>
                            <div className="text-neutral-500 text-xs mt-0.5">{style.desc}</div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {step === 4 && (
                    <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="max-w-md w-full">
                      <h1 className="text-3xl md:text-4xl font-serif font-bold text-neutral-900 mb-2 tracking-tight">Le Cockpit</h1>
                      <p className="text-neutral-500 mb-8 text-sm leading-relaxed">Comment souhaites-tu configurer ton studio d'écriture ?</p>
                      
                      <div className="space-y-4">
                        <button
                          onClick={() => setData({ ...data, advancedSettingsMode: false })}
                          className={`w-full text-left p-5 rounded-xl border transition-all ${!data.advancedSettingsMode ? 'bg-[#FAF9F6] border-[#EE4B2B] shadow-sm' : 'bg-white border-neutral-200 hover:bg-[#FAF9F6]'}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-base font-semibold text-neutral-900">Pilote Automatique (Simple)</div>
                            <span className="bg-[#EE4B2B] text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">Recommandé</span>
                          </div>
                          <div className="text-neutral-500 text-xs">Idéal pour se concentrer uniquement sur les écrits. Le design et le rendu s'adaptent automatiquement sans réglages complexes.</div>
                        </button>
                        
                        <button
                          onClick={() => setData({ ...data, advancedSettingsMode: true })}
                          className={`w-full text-left p-5 rounded-xl border transition-all ${data.advancedSettingsMode ? 'bg-orange-50 border-orange-300' : 'bg-white border-neutral-200 hover:bg-[#FAF9F6]'}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-base font-semibold text-neutral-900 text-orange-800">Mode Manuel (Avancé)</div>
                          </div>
                          <div className="text-neutral-500 text-xs">
                            ⚠️ Conçu pour les structures ou médias à grande échelle. Contrôle total du CSS, des métadonnées, layouts complexes et de la navigation. (Modifiable à tout moment)
                          </div>
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {step === 5 && (
                    <motion.div key="step5" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }} className="flex flex-col items-center justify-center text-center w-full h-full py-12">
                      <Loader2 size={40} className="animate-spin text-[#EE4B2B] mb-6" />
                      <h1 className="text-2xl font-serif font-bold text-neutral-900 mb-2">Génération de ton Sanctuaire...</h1>
                      <p className="text-neutral-500 text-sm">Nous configurons ton sous-domaine, le design choisi et ton premier article de bienvenue.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Navigation Controls */}
              {step < 5 && (
                <div className="flex justify-between items-center shrink-0 pt-4 border-t border-neutral-100">
                  <button 
                    onClick={handleBack} 
                    className={`flex items-center text-neutral-400 hover:text-neutral-900 text-xs font-semibold uppercase tracking-wider transition-colors ${step === 1 ? 'opacity-0 pointer-events-none' : ''}`}
                  >
                    <ArrowLeft size={14} className="mr-1.5" /> Retour
                  </button>
                  
                  <button 
                    onClick={handleNext} 
                    disabled={
                      (step === 1 && (!data.name || !data.heroText)) || 
                      (step === 2 && domainStatus !== "valid")
                    }
                    className="flex items-center bg-[#EE4B2B] hover:bg-[#d63d20] text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-red-500/10"
                  >
                    {step === 4 ? "Lancer mon espace" : "Continuer"} <ArrowRight size={14} className="ml-1.5" />
                  </button>
                </div>
              )}
            </div>
          </BentoItem>

          {/* Right Side: Live Preview (Inactive - Signature Red Container) */}
          <BentoItem
            active={false}
            flexBasisInactive="42%"
            className="hidden lg:block"
            inactiveContent={
              <div className="w-full h-full flex flex-col items-start justify-between p-2">
                {/* Subtle top indicator */}
                <div className="flex items-center gap-1.5 opacity-90 text-white/70 mb-4 px-2 pt-1 select-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                  <span className="text-[9px] uppercase font-bold tracking-[0.15em]">Aperçu en temps réel</span>
                </div>

                {/* The actual Live Preview layout */}
                <div className="w-full flex-1 flex items-center justify-center py-4 px-2">
                  <AnimatePresence mode="wait">
                    {step < 5 && (
                      <motion.div
                        key={data.layoutStyle}
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -15 }}
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full h-full max-w-sm bg-white rounded-[28px] overflow-hidden flex flex-col shadow-xl border border-white/10 transition-colors duration-300"
                        style={{
                          backgroundColor: currentPreviewStyle.bg,
                          color: currentPreviewStyle.text,
                        }}
                      >
                        {/* Simulated Header */}
                        <div className="px-5 py-3.5 border-b border-opacity-10 border-current flex justify-between items-center shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${currentPreviewStyle.font}`} style={{ color: currentPreviewStyle.accent }}>
                              {data.name || "Mon Espace"}
                            </span>
                          </div>
                          <div className="flex gap-3.5 text-[8px] uppercase font-bold tracking-wider opacity-60">
                            <span>Accueil</span>
                            <span>Articles</span>
                          </div>
                        </div>

                        {/* Preview Body */}
                        <div className={`p-6 flex-1 flex flex-col justify-center ${currentPreviewStyle.font}`}>
                          <p className="text-[7.5px] font-bold uppercase tracking-widest mb-1.5" style={{ color: currentPreviewStyle.accent }}>
                            {data.subdomain ? `${data.subdomain}.qoe.fi` : "En attente d'adresse..."}
                          </p>
                          <motion.h1
                            layout
                            className="text-2xl font-bold mb-4 leading-tight tracking-tight whitespace-pre-line"
                          >
                            {data.heroText || "L'architecture du silence."}
                          </motion.h1>
                          <div className="flex items-center gap-3 mt-4">
                            <div className="px-4 py-1.5 rounded text-white font-bold text-[8.5px] uppercase tracking-wider shadow-sm transition-all" style={{ backgroundColor: currentPreviewStyle.accent }}>
                              S'abonner
                            </div>
                            <div className="opacity-60 text-[8.5px] uppercase font-bold tracking-wider">
                              Lire la suite
                            </div>
                          </div>
                        </div>

                        {/* Fake Articles List */}
                        <div className="p-5 pt-0 flex gap-2.5 shrink-0">
                          {[1, 2].map((i) => (
                            <div key={i} className="flex-1 bg-current opacity-[0.04] rounded-md h-16"></div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            }
          >
            {/* Fallback empty active state */}
            <div />
          </BentoItem>
        </BentoPlateau>
      </div>
    </div>
  )
}
