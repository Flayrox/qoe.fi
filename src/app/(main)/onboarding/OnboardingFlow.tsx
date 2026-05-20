"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X, ArrowRight, Loader2, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { completeOnboarding } from "./actions"

export function OnboardingFlow({ categories, suggestedCreators, userId }: { categories: any[], suggestedCreators: any[], userId: string }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // State
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [mutedWordInput, setMutedWordInput] = useState("")
  const [mutedWords, setMutedWords] = useState<string[]>([])
  const [selectedCreators, setSelectedCreators] = useState<string[]>(suggestedCreators.map(c => c.id)) // Default follow all

  // Hardcoded fallback categories if DB is empty during MVP
  const displayCategories = categories.length > 0 ? categories : [
    { id: "1", name: "Géopolitique" }, { id: "2", name: "Sociologie" },
    { id: "3", name: "Tech Éthique" }, { id: "4", name: "Climat" },
    { id: "5", name: "Philosophie" }, { id: "6", name: "Économie" }
  ]

  const handleNext = () => setStep(s => s + 1)
  const handlePrev = () => setStep(s => Math.max(1, s - 1))

  const handleComplete = async () => {
    setIsSubmitting(true)
    try {
      await completeOnboarding({
        interests: selectedInterests,
        mutedWords,
        creatorsToFollow: selectedCreators
      })
      router.push("/home")
    } catch (error) {
      console.error(error)
      setIsSubmitting(false)
    }
  }

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const addMutedWord = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && mutedWordInput.trim()) {
      e.preventDefault()
      if (!mutedWords.includes(mutedWordInput.trim().toLowerCase())) {
        setMutedWords([...mutedWords, mutedWordInput.trim().toLowerCase()])
      }
      setMutedWordInput("")
    }
  }

  const toggleCreator = (id: string) => {
    setSelectedCreators(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
      {/* Progress Bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800">
        <motion.div 
          className="h-full bg-white"
          initial={{ width: "33%" }}
          animate={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      <AnimatePresence mode="wait">
        {/* STEP 1: Interests */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="text-center space-y-4">
              <Sparkles className="w-12 h-12 text-zinc-400 mx-auto" />
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Qu'est-ce qui vous élève ?</h1>
              <p className="text-zinc-400 text-lg">Sélectionnez au moins 3 sujets pour calibrer votre algorithme d'exploration.</p>
            </div>
            
            <div className="flex flex-wrap justify-center gap-3 py-8">
              {displayCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => toggleInterest(cat.id)}
                  className={`px-6 py-3 rounded-full text-sm font-semibold transition-all duration-300 ${
                    selectedInterests.includes(cat.id) 
                      ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] scale-105 border-2 border-white" 
                      : "bg-zinc-800 text-zinc-300 border-2 border-transparent hover:bg-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-zinc-800">
              <button 
                onClick={handleNext}
                disabled={selectedInterests.length < 3}
                className="bg-white text-black px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continuer <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 2: Muted Words */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto">
                <X className="w-6 h-6 text-zinc-400" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Qu'est-ce qui vous épuise ?</h1>
              <p className="text-zinc-400 text-lg">Votre sanctuaire, vos règles. Bannissez les mots, noms ou sujets que vous ne souhaitez plus voir.</p>
            </div>
            
            <div className="py-8 max-w-md mx-auto space-y-6">
              <input
                type="text"
                value={mutedWordInput}
                onChange={e => setMutedWordInput(e.target.value)}
                onKeyDown={addMutedWord}
                placeholder="Ex: Clash, Buzz, Téléréalité... (Appuyez sur Entrée)"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-4 text-lg focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all"
              />

              <div className="flex flex-wrap gap-2 min-h-[100px]">
                {mutedWords.length === 0 && <span className="text-zinc-600 italic">Aucun mot banni.</span>}
                <AnimatePresence>
                  {mutedWords.map(word => (
                    <motion.span
                      key={word}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="px-4 py-2 bg-red-950/30 text-red-400 border border-red-900/50 rounded-lg flex items-center gap-2 text-sm font-medium"
                    >
                      {word}
                      <button onClick={() => setMutedWords(mutedWords.filter(w => w !== word))} className="hover:text-red-300">
                        <X className="w-3 h-3" />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-zinc-800">
              <button onClick={handlePrev} className="text-zinc-400 hover:text-white px-4 py-2">Retour</button>
              <button 
                onClick={handleNext}
                className="bg-white text-black px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-200 transition-colors"
              >
                Continuer <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 3: Cold Start / Creators */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="text-center space-y-4">
              <Check className="w-12 h-12 text-green-400 mx-auto" />
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Vos premiers alliés</h1>
              <p className="text-zinc-400 text-lg">Basé sur vos choix, voici les médias indépendants recommandés pour commencer votre voyage.</p>
            </div>
            
            <div className="py-4 max-w-lg mx-auto space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {suggestedCreators.length === 0 ? (
                <p className="text-center text-zinc-500 py-8">Aucun créateur certifié pour le moment.</p>
              ) : (
                suggestedCreators.map(creator => {
                  const isSelected = selectedCreators.includes(creator.id)
                  return (
                    <button
                      key={creator.id}
                      onClick={() => toggleCreator(creator.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                        isSelected ? "bg-zinc-800/50 border-white/50 shadow-sm" : "bg-zinc-950 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {creator.logoUrl ? <img src={creator.logoUrl} className="w-full h-full object-cover" /> : creator.name?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-white truncate">{creator.name}</h4>
                        <p className="text-sm text-zinc-400 truncate">{creator.heroText || `Média indépendant`}</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected ? "bg-white border-white text-black" : "border-zinc-600"
                      }`}>
                        {isSelected && <Check className="w-4 h-4" />}
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            <div className="flex justify-between pt-4 border-t border-zinc-800">
              <button onClick={handlePrev} className="text-zinc-400 hover:text-white px-4 py-2">Retour</button>
              <button 
                onClick={handleComplete}
                disabled={isSubmitting}
                className="bg-primary text-primary-foreground px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Créer mon sanctuaire"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
