"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslate } from "@qoe/i18n"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@qoe/utils"
import { BentoPlateau, BentoItem } from "@qoe/ui/ui/BentoPlateau"
import { Logo } from "@qoe/ui/ui/Logo"
import { Button } from "@qoe/ui/ui/button"
import { Input } from "@qoe/ui/ui/input"
import { completeOnboarding } from "./actions"
import { Check, X, ShieldAlert, Loader2, Sparkles, UserPlus, UserCheck, EyeOff } from "lucide-react"

interface OnboardingFlowProps {
  categories: Array<{ id: string; name: string; slug: string }>
  suggestedCreators: Array<{
    id: string
    name: string | null
    subdomain: string | null
    logoUrl: string | null
    heroText: string | null
  }>
  userId: string
}

export function OnboardingFlow({ categories, suggestedCreators, userId }: OnboardingFlowProps) {
  const { t } = useTranslate()
  const router = useRouter()
  const [step, setStep] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("qoe_onboarding_step")
      return saved ? parseInt(saved, 10) || 1 : 1
    }
    return 1
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Interests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])

  // Step 2: Biography / DNA
  const [bio, setBio] = useState("")

  // Step 3: Muted Words
  const [mutedWords, setMutedWords] = useState<string[]>([])
  const [mutedInput, setMutedInput] = useState("")

  // Step 4: Creators to follow
  const [followedCreators, setFollowedCreators] = useState<string[]>([])

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("qoe_onboarding_step", String(step))
    }
  }, [step])

  const handleToggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleAddMutedWord = (e: React.FormEvent) => {
    e.preventDefault()
    const word = mutedInput.trim().toLowerCase()
    if (word && !mutedWords.includes(word)) {
      setMutedWords((prev) => [...prev, word])
      setMutedInput("")
    }
  }

  const handleRemoveMutedWord = (word: string) => {
    setMutedWords((prev) => prev.filter((w) => w !== word))
  }

  const handleToggleCreator = (id: string) => {
    setFollowedCreators((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const handleNext = () => {
    if (step === 1 && selectedInterests.length < 3) {
      setError(t("onboarding_reader.s1_desc_fewer", "Veuillez sélectionner au moins 3 centres d'intérêt."))
      return
    }
    setError(null)
    setStep((prev) => prev + 1)
  }

  const handleBack = () => {
    setError(null)
    setStep((prev) => prev - 1)
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)
      setError(null)
      await completeOnboarding({
        interests: selectedInterests,
        onboardingText: bio,
        mutedWords,
        creatorsToFollow: followedCreators,
      })
      if (typeof window !== "undefined") {
        localStorage.removeItem("qoe_onboarding_step")
      }
      router.push("/")
      router.refresh()
    } catch (err: any) {
      setError(err.message || "Failed to save preferences")
      setLoading(false)
    }
  }

  // Right-side context information dependent on current step
  const getContextData = () => {
    switch (step) {
      case 1:
        return {
          label: t("onboarding_reader.step_label", "Étape") + " 1 / 4",
          title: "Votre Sanctuaire commence ici.",
          desc: "Sélectionnez les matières et idées qui éveillent votre réflexion. Pas d'algorithmes publicitaires ou compulsifs, juste les thématiques que vous décidez d'explorer.",
          footer: "QOE.FI — ZÉRO ATTENTION COMMERCIALE",
        }
      case 2:
        return {
          label: t("onboarding_reader.step_label", "Étape") + " 2 / 4",
          title: "Profil & Alignement Thématique",
          desc: "Décrivez vos sujets d'intérêt et votre vision pour personnaliser les suggestions de publications et les recommandations de créateurs.",
          footer: "QOE.FI — ALIGNEMENT THÉMATIQUE SUR MESURE",
        }
      case 3:
        return {
          label: t("onboarding_reader.step_label", "Étape") + " 3 / 4",
          title: "Le Bouclier de l'Attention",
          desc: "Le bruit informationnel est le premier obstacle au temps long. En filtrant les concepts toxiques, vous reprenez le contrôle absolu de votre fil de lecture.",
          footer: "FILTRAGE SOUVERAIN AU NIVEAU DE L'ÉLECTRON",
        }
      case 4:
      default:
        return {
          label: t("onboarding_reader.step_label", "Étape") + " 4 / 4",
          title: "Souveraineté des Médias",
          desc: "Sur qoe.fi, les auteurs écrivent en toute indépendance, sans dépendre de régies publicitaires capitalistes ou d'intermédiaires. Suivez-les pour enrichir votre univers.",
          footer: "MODÈLE D'ABONNEMENT COMPATIBLE RGPD",
        }
    }
  }

  const context = getContextData()

  return (
    <div className="w-full">
      <BentoPlateau className="md:h-[640px]">
        {/* Active Side (Left) */}
        <BentoItem active={true} flexBasisActive="58%" innerClassName="bg-card text-card-foreground">
          <div className="w-full h-full flex flex-col justify-between p-8 md:p-12 relative overflow-y-auto">
            
            {/* Top Row: Title / Error Display */}
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-1">
                    {step === 1 && t("onboarding_reader.s1_title", "Qu'est-ce qui vous élève ?")}
                    {step === 2 && t("onboarding_reader.s2_title", "Détaillez vos lectures idéales.")}
                    {step === 3 && t("onboarding_reader.s3_title", "Préservez votre attention.")}
                    {step === 4 && t("onboarding_reader.s4_title", "Choisissez vos alliés.")}
                  </h2>
                  <p className="text-muted-foreground text-xs">
                    {step === 1 && t("onboarding_reader.s1_desc", "Sélectionnez au moins 3 centres d'intérêt pour calibrer votre sanctuaire.")}
                    {step === 2 && t("onboarding_reader.s2_desc", "Décrivez vos sujets favoris pour calibrer vos recommandations par IA.")}
                    {step === 3 && t("onboarding_reader.s3_desc", "Bannissez les mots ou sujets qui polluent votre réflexion.")}
                    {step === 4 && t("onboarding_reader.s4_desc", "Voici quelques créateurs certifiés qui correspondent à vos affinités.")}
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 mb-6 bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1">{error}</div>
                </div>
              )}

              {/* Step Forms */}
              <div className="my-2">
                <AnimatePresence mode="wait">
                  {step === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.3 }}
                      className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                    >
                      {categories.map((cat) => {
                        const selected = selectedInterests.includes(cat.id)
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => handleToggleInterest(cat.id)}
                            className={cn(
                              "flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all text-left group",
                              selected
                                ? "bg-[#EE4B2B]/5 border-[#EE4B2B] text-[#EE4B2B] shadow-sm"
                                : "bg-neutral-50/50 hover:bg-neutral-100/80 border-neutral-200 text-neutral-600 hover:text-neutral-900"
                            )}
                          >
                            <span className="truncate">{cat.name}</span>
                            <div
                              className={cn(
                                "w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0 ml-1.5",
                                selected
                                  ? "bg-[#EE4B2B] border-[#EE4B2B] text-white"
                                  : "border-neutral-300 bg-white group-hover:border-neutral-400"
                              )}
                            >
                              {selected && <Check className="w-2.5 h-2.5" />}
                            </div>
                          </button>
                        )
                      })}
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-3"
                    >
                      <div className="relative">
                        <textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value.slice(0, 1000))}
                          placeholder={t("onboarding_reader.s2_textarea_placeholder", "J'aime lire des articles sur l'émancipation économique, la sociologie...")}
                          rows={6}
                          className="w-full rounded-xl bg-neutral-50/50 border border-neutral-200 p-4 text-sm focus:outline-none focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] resize-none"
                        />
                        <div className="absolute bottom-3 right-3 text-[10px] text-muted-foreground font-mono">
                          {t("onboarding_reader.s2_chars", { count: bio.length })}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {step === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <form onSubmit={handleAddMutedWord} className="flex gap-2">
                        <Input
                          value={mutedInput}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMutedInput(e.target.value)}
                          placeholder={t("onboarding_reader.s3_input_placeholder", "Ex: Buzz, Polémique...")}
                          className="h-10 rounded-xl bg-neutral-50/50 border-neutral-200 flex-1"
                        />
                        <Button type="submit" className="h-10 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-xs">
                          + Ajouter
                        </Button>
                      </form>

                      <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto p-1 border border-neutral-100 rounded-lg bg-neutral-50/30">
                        {mutedWords.length === 0 ? (
                          <div className="w-full text-center py-6 text-xs text-muted-foreground font-mono flex items-center justify-center gap-1.5">
                            <EyeOff className="w-3.5 h-3.5" />
                            Aucun mot exclu pour le moment.
                          </div>
                        ) : (
                          mutedWords.map((word) => (
                            <span
                              key={word}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-200/60 text-neutral-800 text-xs font-medium"
                            >
                              <span>{word}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveMutedWord(word)}
                                className="w-3.5 h-3.5 rounded-full hover:bg-neutral-300 flex items-center justify-center text-neutral-500 hover:text-neutral-800 transition-colors"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}

                  {step === 4 && (
                    <motion.div
                      key="step4"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.3 }}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[260px] overflow-y-auto pr-1"
                    >
                      {suggestedCreators.map((creator) => {
                        const followed = followedCreators.includes(creator.id)
                        return (
                          <div
                            key={creator.id}
                            className={cn(
                              "p-3 rounded-xl border flex items-center gap-3 transition-colors",
                              followed ? "bg-neutral-50/50 border-neutral-300" : "bg-neutral-50/20 border-neutral-100"
                            )}
                          >
                            <div className="w-10 h-10 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center overflow-hidden shrink-0">
                              {creator.logoUrl ? (
                                <img src={creator.logoUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="font-bold text-sm text-neutral-400">
                                  {(creator.name || creator.id).slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-xs text-neutral-900 truncate">
                                {creator.name || "Auteur"}
                              </h4>
                              <p className="text-[10px] text-muted-foreground font-mono truncate">
                                @{creator.subdomain || "creator"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleCreator(creator.id)}
                              className={cn(
                                "p-2 rounded-lg border flex items-center justify-center transition-colors shrink-0",
                                followed
                                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/20"
                                  : "bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-600"
                              )}
                            >
                              {followed ? (
                                <UserCheck className="w-3.5 h-3.5" />
                              ) : (
                                <UserPlus className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom Actions Row */}
            <div className="flex items-center justify-between border-t border-neutral-100 pt-6 mt-6">
              {step > 1 ? (
                <Button
                  onClick={handleBack}
                  variant="outline"
                  disabled={loading}
                  className="rounded-xl px-4 py-2 text-xs font-semibold"
                >
                  {t("common.back", "Retour")}
                </Button>
              ) : (
                <div />
              )}

              {step < 4 ? (
                <Button
                  onClick={handleNext}
                  className="rounded-xl px-5 py-2 bg-[#EE4B2B] hover:bg-[#d63d20] text-white font-semibold text-xs transition-colors"
                >
                  {t("common.continue", "Continuer")}
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="rounded-xl px-5 py-2 bg-[#EE4B2B] hover:bg-[#d63d20] text-white font-semibold text-xs transition-colors flex items-center gap-1.5"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {t("onboarding_reader.finish_btn", "Entrer dans le sanctuaire")}
                </Button>
              )}
            </div>

          </div>
        </BentoItem>

        {/* Branding/Context Side (Right) */}
        <BentoItem active={false} flexBasisInactive="42%" inactiveContent={
          <div className="w-full h-full flex flex-col items-start justify-between">
            <Logo className="h-8 w-auto opacity-90" fillColor="#FFFFFF" />

            <div className="mt-auto relative w-full min-h-[140px] text-white">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="absolute inset-0 flex flex-col justify-end pb-2"
                >
                  <p className="text-white/50 text-[10px] uppercase tracking-[0.2em] mb-2">
                    {context.label}
                  </p>
                  <h3 className="text-white text-2xl font-bold tracking-tight leading-tight mb-3 whitespace-pre-line">
                    {context.title}
                  </h3>
                  <p className="text-white/80 text-xs max-w-sm leading-relaxed mb-4">
                    {context.desc}
                  </p>
                  <p className="text-white/40 text-[9px] uppercase tracking-wider font-mono whitespace-pre-line leading-normal">
                    {context.footer}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        }>
          <div />
        </BentoItem>
      </BentoPlateau>
    </div>
  )
}
