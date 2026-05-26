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
  const [onboardingText, setOnboardingText] = useState("");
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
        onboardingText,
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
    <div className="relative w-full max-w-4xl mx-auto min-h-[600px] flex flex-col bg-card/60 backdrop-blur-3xl border border-border/40 rounded-[3rem] overflow-hidden shadow-2xl transition-colors duration-500">
      
      {/* Progress Header */}
      <div className="p-8 border-b border-border/30 flex items-center justify-between relative z-10">
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`h-1 w-12 rounded-full transition-colors duration-500 ${step >= i ? "bg-[#EE4B2B]" : "bg-neutral-200"}`} />
          ))}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          {t("onboarding_step", "Étape")} {step} / 4
        </span>
      </div>

      <div className="flex-1 relative overflow-hidden p-8 md:p-16 z-10">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: Categories Constellation */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 50, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -50, filter: "blur(10px)" }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="h-full flex flex-col"
            >
              <div className="mb-12">
                <Sparkles className="w-8 h-8 text-primary mb-6" />
                <h2 className="font-classical text-4xl text-foreground mb-4">{t("onboarding_s1_title", "Qu'est-ce qui vous élève ?")}</h2>
                <p className="text-muted-foreground text-sm">
                  {categories.length >= 3 
                    ? t("onboarding_s1_desc", "Sélectionnez au moins 3 centres d'intérêt pour calibrer votre sanctuaire.")
                    : t("onboarding_s1_desc_fewer", `Sélectionnez vos centres d'intérêt (sélectionnez au moins ${categories.length} centres) pour calibrer votre sanctuaire.`)}
                </p>
              </div>

              <div className="flex-1 flex flex-wrap gap-4 items-center justify-center py-8">
                {categories.map((cat, i) => (
                  <motion.button
                    key={cat.id}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => toggleInterest(cat.id)}
                    className={`px-8 py-4 rounded-full border-2 transition-all duration-300 text-sm font-medium cursor-pointer ${
                      selectedInterests.includes(cat.id) 
                        ? "bg-[#EE4B2B] text-white border-[#EE4B2B] shadow-lg scale-105" 
                        : "bg-muted/30 text-muted-foreground border-border/40 hover:border-[#EE4B2B]/40 hover:text-foreground"
                    }`}
                  >
                    {cat.name}
                  </motion.button>
                ))}
              </div>

              <div className="mt-auto pt-8 flex justify-end">
                <button
                  disabled={selectedInterests.length < Math.min(3, categories.length)}
                  onClick={handleNext}
                  className="group flex items-center gap-3 px-10 py-4 bg-foreground text-background rounded-full font-bold transition-all disabled:opacity-20 disabled:grayscale cursor-pointer text-sm"
                >
                  {t("common_continue", "Continuer")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}
          {/* STEP 2: Paragraph detail */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 50, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -50, filter: "blur(10px)" }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="h-full flex flex-col"
            >
              <div className="mb-8">
                <Sparkles className="w-8 h-8 text-[#EE4B2B] mb-4 animate-pulse" />
                <h2 className="font-sans font-bold text-3xl text-foreground mb-2">
                  Détaillez vos lectures idéales.
                </h2>
                <p className="text-muted-foreground text-sm">
                  Rédigez un paragraphe sur vos sujets favoris, vos questions du moment ou ce que vous recherchez. Notre IA sémantique l'analysera pour calibrer vos recommandations.
                </p>
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                {/* Left Bento Explanation */}
                <div className="md:col-span-2 bg-[#F97316]/5 border border-[#F97316]/20 p-6 rounded-2xl flex flex-col justify-between">
                  <div>
                    <h4 className="font-semibold text-lg text-[#F97316] mb-2">Recommandation Sémantique</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Contrairement aux flux de buzz compulsifs, nous vectorisons vos écrits et les comparons à la distance cosinusoïdale (pgvector) des articles. Plus votre description est honnête et profonde, plus votre sanctuaire sera pertinent.
                    </p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border/40 text-[10px] font-mono text-muted-foreground">
                    DIMENSIONS VECTORIELLES : 1536<br />
                    MOTEUR : PGVECTOR + EMBEDDINGS
                  </div>
                </div>

                {/* Right Text Area */}
                <div className="md:col-span-3 flex flex-col">
                  <textarea
                    autoFocus
                    value={onboardingText}
                    onChange={(e) => setOnboardingText(e.target.value)}
                    placeholder="J'aime lire des articles sur l'émancipation économique, la sociologie des technologies, des revues de presse fouillées sur l'indépendance des médias, et les essais philosophiques sur la culture..."
                    maxLength={1000}
                    className="w-full flex-1 bg-muted/20 border border-border/80 p-5 rounded-2xl text-sm leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-[#EE4B2B]/20 focus:border-[#EE4B2B] transition-all resize-none min-h-[160px]"
                  />
                  <div className="text-right text-[10px] font-mono text-muted-foreground mt-2">
                    {onboardingText.length} / 1000 caractères
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-4 flex justify-between">
                <button onClick={handleBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-sm">
                  <ArrowLeft className="w-4 h-4" /> {t("common_back", "Retour")}
                </button>
                <button
                  onClick={handleNext}
                  className="group flex items-center gap-3 px-10 py-4 bg-foreground text-background rounded-full font-bold transition-all cursor-pointer text-sm"
                >
                  {t("common_continue", "Continuer")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Muted Words */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 50, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -50, filter: "blur(10px)" }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="h-full flex flex-col"
            >
              <div className="mb-12">
                <Shield className="w-8 h-8 text-primary mb-6" />
                <h2 className="font-classical text-4xl text-foreground mb-4">{t("onboarding_s2_title", "Préservez votre attention.")}</h2>
                <p className="text-muted-foreground text-sm">{t("onboarding_s2_desc", "Bannissez les mots ou sujets qui polluent votre réflexion. Aucun article les contenant ne vous sera proposé.")}</p>
              </div>

              <div className="flex-1 space-y-8">
                <form onSubmit={addMutedWord} className="relative">
                  <input
                    autoFocus
                    type="text"
                    value={mutedInput}
                    onChange={(e) => setMutedInput(e.target.value)}
                    placeholder={t("onboarding_s2_placeholder", "Ex: Clash, Buzz, Polémique...")}
                    className="w-full bg-muted/20 border-b-2 border-border/60 py-6 px-4 text-2xl text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-foreground transition-all"
                  />
                  <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-muted border border-border/40 flex items-center justify-center hover:bg-foreground hover:text-background transition-all cursor-pointer">
                    <Check className="w-5 h-5" />
                  </button>
                </form>

                <div className="flex flex-wrap gap-3">
                  <AnimatePresence>
                    {mutedWords.map(word => (
                      <motion.span
                        key={word}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 rounded-lg text-sm"
                      >
                        {word}
                        <button onClick={() => setMutedWords(mutedWords.filter(w => w !== word))} className="cursor-pointer hover:scale-110">
                          <X className="w-3 h-3" />
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div className="mt-auto pt-8 flex justify-between">
                <button onClick={handleBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-sm">
                  <ArrowLeft className="w-4 h-4" /> {t("common_back", "Retour")}
                </button>
                <button
                  onClick={handleNext}
                  className="group flex items-center gap-3 px-10 py-4 bg-foreground text-background rounded-full font-bold transition-all cursor-pointer text-sm"
                >
                  {t("common_continue", "Continuer")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Creators */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 50, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -50, filter: "blur(10px)" }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="h-full flex flex-col"
            >
              <div className="mb-12">
                <Users className="w-8 h-8 text-primary mb-6" />
                <h2 className="font-classical text-4xl text-foreground mb-4">{t("onboarding_s3_title", "Choisissez vos alliés.")}</h2>
                <p className="text-muted-foreground text-sm">{t("onboarding_s3_desc", "Voici quelques créateurs certifiés qui correspondent à vos affinités. Suivez-les pour peupler votre premier feed.")}</p>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto pr-4 custom-scrollbar max-h-[300px]">
                {suggestedCreators.map(creator => (
                  <button
                    key={creator.id}
                    onClick={() => toggleCreator(creator.id)}
                    className={`w-full flex items-center gap-6 p-6 rounded-[2rem] border-2 transition-all duration-300 text-left cursor-pointer ${
                      selectedCreators.includes(creator.id)
                        ? "bg-primary/[0.03] border-primary/40 shadow-sm"
                        : "bg-muted/10 border-border/20 hover:border-border/60"
                    }`}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/50">
                      {creator.logoUrl ? <img src={creator.logoUrl} className="w-full h-full object-cover" /> : creator.name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-lg font-bold text-foreground mb-1 truncate">{creator.name}</h4>
                      <p className="text-muted-foreground text-sm truncate">{creator.heroText || "Média indépendant"}</p>
                    </div>
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedCreators.includes(creator.id) 
                        ? "bg-foreground border-foreground text-background" 
                        : "border-border text-transparent"
                    }`}>
                      <Check className="w-5 h-5" />
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-8 flex justify-between items-center">
                <button onClick={handleBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-sm">
                  <ArrowLeft className="w-4 h-4" /> {t("common_back", "Retour")}
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={handleComplete}
                  className="group flex items-center gap-3 px-10 py-4 bg-[#EE4B2B] text-white rounded-full font-bold transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-lg text-sm"
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
    </div>
  );
};
