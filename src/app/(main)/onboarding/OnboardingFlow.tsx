"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslate } from "@tolgee/react";
import { ArrowRight, ArrowLeft, X, Check, Sparkles, Shield, Users, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "./actions";

interface OnboardingFlowProps {
  categories: any[];
  suggestedCreators: any[];
  userId: string;
}

export const OnboardingFlow = ({ categories, suggestedCreators, userId }: OnboardingFlowProps) => {
  const { t } = useTranslate();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [mutedWords, setMutedWords] = useState<string[]>([]);
  const [mutedInput, setMutedInput] = useState("");
  const [selectedCreators, setSelectedCreators] = useState<string[]>(suggestedCreators.map(c => c.id));

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await completeOnboarding({
        interests: selectedInterests,
        mutedWords,
        creatorsToFollow: selectedCreators
      });
      router.push("/home");
    } catch (error) {
      console.error(error);
      setIsSubmitting(false);
    }
  };

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const addMutedWord = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (mutedInput.trim() && !mutedWords.includes(mutedInput.trim().toLowerCase())) {
      setMutedWords([...mutedWords, mutedInput.trim().toLowerCase()]);
      setMutedInput("");
    }
  };

  const toggleCreator = (id: string) => {
    setSelectedCreators(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto min-h-[600px] flex flex-col bg-neutral-900/40 backdrop-blur-3xl border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl">
      
      {/* Progress Header */}
      <div className="p-8 border-b border-white/5 flex items-center justify-between">
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className={`h-1 w-12 rounded-full transition-colors duration-500 ${step >= i ? "bg-white" : "bg-white/10"}`} />
          ))}
        </div>
        <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
          {t("onboarding_step", "Étape")} {step} / 3
        </span>
      </div>

      <div className="flex-1 relative overflow-hidden p-8 md:p-16">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: Categories Constellation */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 100, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -100, filter: "blur(10px)" }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="h-full flex flex-col"
            >
              <div className="mb-12">
                <Sparkles className="w-8 h-8 text-emerald-400 mb-6" />
                <h2 className="font-classical text-4xl text-white mb-4">{t("onboarding_s1_title", "Qu'est-ce qui vous élève ?")}</h2>
                <p className="text-white/40">{t("onboarding_s1_desc", "Sélectionnez au moins 3 centres d'intérêt pour calibrer votre sanctuaire.")}</p>
              </div>

              <div className="flex-1 flex flex-wrap gap-4 items-center justify-center py-8">
                {categories.map((cat, i) => (
                  <motion.button
                    key={cat.id}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => toggleInterest(cat.id)}
                    className={`px-8 py-4 rounded-full border-2 transition-all duration-500 text-sm font-medium ${
                      selectedInterests.includes(cat.id) 
                        ? "bg-white text-black border-white shadow-[0_0_30px_rgba(255,255,255,0.2)] scale-110" 
                        : "bg-white/5 text-white/60 border-white/5 hover:border-white/20"
                    }`}
                  >
                    {cat.name}
                  </motion.button>
                ))}
              </div>

              <div className="mt-auto pt-8 flex justify-end">
                <button
                  disabled={selectedInterests.length < 3}
                  onClick={handleNext}
                  className="group flex items-center gap-3 px-10 py-4 bg-white text-black rounded-full font-bold transition-all disabled:opacity-20 disabled:grayscale"
                >
                  {t("common_continue", "Continuer")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Muted Words */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 100, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -100, filter: "blur(10px)" }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="h-full flex flex-col"
            >
              <div className="mb-12">
                <Shield className="w-8 h-8 text-red-400 mb-6" />
                <h2 className="font-classical text-4xl text-white mb-4">{t("onboarding_s2_title", "Préservez votre attention.")}</h2>
                <p className="text-white/40">{t("onboarding_s2_desc", "Bannissez les mots ou sujets qui polluent votre réflexion. Aucun article les contenant ne vous sera proposé.")}</p>
              </div>

              <div className="flex-1 space-y-8">
                <form onSubmit={addMutedWord} className="relative">
                  <input
                    autoFocus
                    type="text"
                    value={mutedInput}
                    onChange={(e) => setMutedInput(e.target.value)}
                    placeholder={t("onboarding_s2_placeholder", "Ex: Clash, Buzz, Polémique...")}
                    className="w-full bg-white/5 border-b-2 border-white/10 py-6 px-4 text-2xl text-white placeholder:text-white/10 focus:outline-none focus:border-white transition-all"
                  />
                  <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white hover:text-black transition-all">
                    <Check className="w-5 h-5" />
                  </button>
                </form>

                <div className="flex flex-wrap gap-3">
                  <AnimatePresence>
                    {mutedWords.map(word => (
                      <motion.span
                        key={word}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm"
                      >
                        {word}
                        <button onClick={() => setMutedWords(mutedWords.filter(w => w !== word))}>
                          <X className="w-3 h-3" />
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div className="mt-auto pt-8 flex justify-between">
                <button onClick={handleBack} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" /> {t("common_back", "Retour")}
                </button>
                <button
                  onClick={handleNext}
                  className="group flex items-center gap-3 px-10 py-4 bg-white text-black rounded-full font-bold transition-all"
                >
                  {t("common_continue", "Continuer")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Creators */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 100, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -100, filter: "blur(10px)" }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="h-full flex flex-col"
            >
              <div className="mb-12">
                <Users className="w-8 h-8 text-blue-400 mb-6" />
                <h2 className="font-classical text-4xl text-white mb-4">{t("onboarding_s3_title", "Choisissez vos alliés.")}</h2>
                <p className="text-white/40">{t("onboarding_s3_desc", "Voici quelques créateurs certifiés qui correspondent à vos affinités. Suivez-les pour peupler votre premier feed.")}</p>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto pr-4 custom-scrollbar">
                {suggestedCreators.map(creator => (
                  <button
                    key={creator.id}
                    onClick={() => toggleCreator(creator.id)}
                    className={`w-full flex items-center gap-6 p-6 rounded-[2rem] border-2 transition-all duration-500 text-left ${
                      selectedCreators.includes(creator.id)
                        ? "bg-white/10 border-white/40"
                        : "bg-white/5 border-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/10">
                      {creator.logoUrl ? <img src={creator.logoUrl} className="w-full h-full object-cover" /> : creator.name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xl font-bold text-white mb-1 truncate">{creator.name}</h4>
                      <p className="text-white/40 text-sm truncate">{creator.heroText || "Média indépendant"}</p>
                    </div>
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedCreators.includes(creator.id) ? "bg-white border-white text-black" : "border-white/20 text-transparent"
                    }`}>
                      <Check className="w-5 h-5" />
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-8 flex justify-between items-center">
                <button onClick={handleBack} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" /> {t("common_back", "Retour")}
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={handleComplete}
                  className="group flex items-center gap-3 px-10 py-4 bg-emerald-500 text-white rounded-full font-bold transition-all hover:bg-emerald-400 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {t("onboarding_finish", "Entrer dans le sanctuaire")} <Sparkles className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Decorative Halo */}
      <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-emerald-500/10 blur-[150px] rounded-full pointer-events-none" />
    </div>
  );
};
