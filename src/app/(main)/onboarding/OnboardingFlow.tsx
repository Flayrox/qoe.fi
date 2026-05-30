"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslate } from "@tolgee/react";
import { ArrowRight, ArrowLeft, X, Check, Sparkles, Shield, Users, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "./actions";
import { trackEvent } from "@/lib/analytics";

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
      trackEvent("onboarding_complete", {
        interests: selectedInterests.length,
        mutedWords: mutedWords.length,
        creatorsFollowed: selectedCreators.length
      });
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
    <div className="relative w-full max-w-4xl mx-auto min-h-[600px] flex flex-col bg-card/60 backdrop-blur-3xl border border-border/40 rounded-[var(--radius-plateau)] overflow-hidden shadow-2xl transition-colors duration-500">
      
      {/* Progress Header */}
      <div className="p-8 border-b border-border/30 flex items-center justify-between relative z-10">
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`h-1 w-12 rounded-[var(--radius-button)] transition-colors duration-500 ${step >= i ? "bg-[var(--qoe-vermillion)]" : "bg-neutral-200"}`} />
          ))}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest font-semibold">
          {t("onboarding_reader.step_label", "Étape")} {step} / 4
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
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              className="h-full flex flex-col"
            >
              <div className="mb-12">
                <Sparkles className="w-8 h-8 text-primary mb-6" />
                <h2 className="font-classical text-4xl text-foreground mb-4">{t("onboarding_reader.s1_title", "Qu'est-ce qui vous élève ?")}</h2>
                <p className="text-muted-foreground text-sm">
                  {categories.length >= 3 
                    ? t("onboarding_reader.s1_desc", "Sélectionnez au moins 3 centres d'intérêt pour calibrer votre sanctuaire.")
                    : t("onboarding_reader.s1_desc_fewer", `Sélectionnez vos centres d'intérêt (sélectionnez au moins ${categories.length} centres) pour calibrer votre sanctuaire.`, { count: categories.length })}
                </p>
              </div>

              <div className="flex-1 flex flex-wrap gap-4 items-center justify-center py-8">
                {categories.map((cat, i) => (
                  <motion.button
                    key={cat.id}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30, delay: i * 0.04 }}
                    onClick={() => toggleInterest(cat.id)}
                    className={`px-8 py-4 rounded-[var(--radius-button)] border-2 transition-all duration-305 text-sm font-medium cursor-pointer ${
                      selectedInterests.includes(cat.id) 
                        ? "bg-[var(--qoe-vermillion)] text-white border-[var(--qoe-vermillion)] shadow-lg scale-105" 
                        : "bg-muted/30 text-muted-foreground border-border/40 hover:border-[var(--qoe-vermillion)]/40 hover:text-foreground"
                    }`}
                  >
                    {cat.name}
                  </motion.button>
                ))}
              </div>

              <div className="mt-auto pt-8 flex justify-end">
                <motion.button
                  disabled={selectedInterests.length < Math.min(3, categories.length)}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    trackEvent("onboarding_interests_submit", { count: selectedInterests.length });
                    handleNext();
                  }}
                  className="group flex items-center gap-3 px-10 py-4 bg-foreground text-background rounded-[var(--radius-button)] font-bold transition-all disabled:opacity-20 disabled:grayscale cursor-pointer text-sm"
                >
                  {t("common.continue", "Continuer")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </motion.button>
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
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              className="h-full flex flex-col"
            >
              <div className="mb-8">
                <Sparkles className="w-8 h-8 text-[var(--qoe-vermillion)] mb-4 animate-pulse" />
                <h2 className="font-sans font-bold text-3xl text-foreground mb-2">
                  {t("onboarding_reader.s2_title", "Détaillez vos lectures idéales.")}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {t("onboarding_reader.s2_desc", "Rédigez un paragraphe sur vos sujets favoris, vos questions du moment ou ce que vous recherchez. Notre IA sémantique l'analysera pour calibrer vos recommandations.")}
                </p>
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                {/* Left Bento Explanation */}
                <div className="md:col-span-2 bg-[var(--surface-2)] border border-[var(--border-default)] p-6 rounded-[var(--radius-card)] flex flex-col justify-between">
                  <div>
                    <h4 className="font-semibold text-lg text-foreground mb-2">{t("onboarding_reader.s2_bento_title", "Recommandation Sémantique")}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t("onboarding_reader.s2_bento_desc", "Contrairement aux flux de buzz compulsifs, nous vectorisons vos écrits et les comparons à la distance cosinusoïdale (pgvector) des articles. Plus votre description est honnête et profonde, plus votre sanctuaire sera pertinent.")}
                    </p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border/40 text-[10px] font-mono text-muted-foreground whitespace-pre-line">
                    {t("onboarding_reader.s2_bento_footer", "DIMENSIONS VECTORIELLES : 1536\nMOTEUR : PGVECTOR + EMBEDDINGS")}
                  </div>
                </div>

                {/* Right Text Area */}
                <div className="md:col-span-3 flex flex-col">
                  <textarea
                    autoFocus
                    value={onboardingText}
                    onChange={(e) => setOnboardingText(e.target.value)}
                    placeholder={t("onboarding_reader.s2_textarea_placeholder", "J'aime lire des articles sur l'émancipation économique, la sociologie des technologies, des revues de presse fouillées sur l'indépendance des médias, et les essais philosophiques sur la culture...")}
                    maxLength={1000}
                    className="w-full flex-1 bg-muted/20 border border-border/80 p-5 rounded-[var(--radius-element)] text-sm leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-[var(--qoe-vermillion)]/20 focus:border-[var(--qoe-vermillion)] transition-all resize-none min-h-[160px]"
                  />
                  <div className="text-right text-[10px] font-mono text-muted-foreground mt-2">
                    {t("onboarding_reader.s2_chars", "{count} / 1000 caractères", { count: onboardingText.length })}
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-4 flex justify-between">
                <motion.button 
                  onClick={handleBack} 
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-sm px-4 py-2 rounded-[var(--radius-button)] hover:bg-muted/30"
                >
                  <ArrowLeft className="w-4 h-4" /> {t("common.back", "Retour")}
                </motion.button>
                <motion.button
                  onClick={() => {
                    trackEvent("onboarding_text_submit", { length: onboardingText.length });
                    handleNext();
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="group flex items-center gap-3 px-10 py-4 bg-foreground text-background rounded-[var(--radius-button)] font-bold transition-all cursor-pointer text-sm"
                >
                  {t("common.continue", "Continuer")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </motion.button>
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
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              className="h-full flex flex-col"
            >
              <div className="mb-12">
                <Shield className="w-8 h-8 text-primary mb-6" />
                <h2 className="font-classical text-4xl text-foreground mb-4">{t("onboarding_reader.s3_title", "Préservez votre attention.")}</h2>
                <p className="text-muted-foreground text-sm">{t("onboarding_reader.s3_desc", "Bannissez les mots ou sujets qui polluent votre réflexion. Aucun article les contenant ne vous sera proposé.")}</p>
              </div>

              <div className="flex-1 space-y-8">
                <form onSubmit={addMutedWord} className="relative">
                  <input
                    autoFocus
                    type="text"
                    value={mutedInput}
                    onChange={(e) => setMutedInput(e.target.value)}
                    placeholder={t("onboarding_reader.s3_input_placeholder", "Ex: Clash, Buzz, Polémique...")}
                    className="w-full bg-muted/20 border-b-2 border-border/60 py-6 px-4 text-2xl text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-[var(--qoe-vermillion)] transition-all"
                  />
                  <motion.button 
                    type="submit" 
                    whileTap={{ scale: 0.95 }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-[var(--radius-button)] bg-muted border border-border/40 flex items-center justify-center hover:bg-foreground hover:text-background transition-all cursor-pointer"
                  >
                    <Check className="w-5 h-5" />
                  </motion.button>
                </form>

                <div className="flex flex-wrap gap-3">
                  <AnimatePresence>
                    {mutedWords.map(word => (
                      <motion.span
                        key={word}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 rounded-[var(--radius-element)] text-sm"
                      >
                        {word}
                        <motion.button 
                          onClick={() => setMutedWords(mutedWords.filter(w => w !== word))} 
                          whileTap={{ scale: 0.85 }}
                          className="cursor-pointer hover:scale-110 p-1 -m-1"
                        >
                          <X className="w-3 h-3" />
                        </motion.button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div className="mt-auto pt-8 flex justify-between">
                <motion.button 
                  onClick={handleBack} 
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-sm px-4 py-2 rounded-[var(--radius-button)] hover:bg-muted/30"
                >
                  <ArrowLeft className="w-4 h-4" /> {t("common.back", "Retour")}
                </motion.button>
                <motion.button
                  onClick={() => {
                    trackEvent("onboarding_muted_words_submit", { count: mutedWords.length });
                    handleNext();
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="group flex items-center gap-3 px-10 py-4 bg-foreground text-background rounded-[var(--radius-button)] font-bold transition-all cursor-pointer text-sm"
                >
                  {t("common.continue", "Continuer")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </motion.button>
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
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              className="h-full flex flex-col"
            >
              <div className="mb-12">
                <Users className="w-8 h-8 text-primary mb-6" />
                <h2 className="font-classical text-4xl text-foreground mb-4">{t("onboarding_reader.s4_title", "Choisissez vos alliés.")}</h2>
                <p className="text-muted-foreground text-sm">{t("onboarding_reader.s4_desc", "Voici quelques créateurs certifiés qui correspondent à vos affinités. Suivez-les pour peupler votre premier feed.")}</p>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto pr-4 custom-scrollbar max-h-[300px]">
                {suggestedCreators.map(creator => (
                  <motion.button
                    key={creator.id}
                    onClick={() => toggleCreator(creator.id)}
                    whileTap={{ scale: 0.99 }}
                    className={`w-full flex items-center gap-6 p-6 rounded-[var(--radius-card)] border-2 transition-all duration-300 text-left cursor-pointer ${
                      selectedCreators.includes(creator.id)
                        ? "bg-[var(--qoe-vermillion-08)] border-[var(--qoe-vermillion)]/40 shadow-sm"
                        : "bg-muted/10 border-border/20 hover:border-border/60"
                    }`}
                  >
                    <div className="w-16 h-16 rounded-[var(--radius-icon)] bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/50">
                      {creator.logoUrl ? <img src={creator.logoUrl} className="w-full h-full object-cover" /> : creator.name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-lg font-bold text-foreground mb-1 truncate">{creator.name}</h4>
                      <p className="text-muted-foreground text-sm truncate">{creator.heroText || t("onboarding_reader.s4_default_hero", "Média indépendant")}</p>
                    </div>
                    <div className={`w-8 h-8 rounded-[var(--radius-button)] border-2 flex items-center justify-center transition-all ${
                      selectedCreators.includes(creator.id) 
                        ? "bg-foreground border-foreground text-background" 
                        : "border-border text-transparent"
                    }`}>
                      <Check className="w-5 h-5" />
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className="mt-auto pt-8 flex justify-between items-center">
                <motion.button 
                  onClick={handleBack} 
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-sm px-4 py-2 rounded-[var(--radius-button)] hover:bg-muted/30"
                >
                  <ArrowLeft className="w-4 h-4" /> {t("common.back", "Retour")}
                </motion.button>
                <motion.button
                  disabled={isSubmitting}
                  onClick={handleComplete}
                  whileTap={{ scale: 0.98 }}
                  className="group flex items-center gap-3 px-10 py-4 bg-[var(--qoe-vermillion)] text-white rounded-[var(--radius-button)] font-bold transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-lg text-sm"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {t("onboarding_reader.finish_btn", "Entrer dans le sanctuaire")} <Sparkles className="w-5 h-5" />
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
