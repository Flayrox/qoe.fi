'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { t } from '@lingui/core/macro';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@qoe/utils';
import { Logo } from '../Logo';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Check,
  ShieldAlert,
  Loader2,
  Sparkles,
  UserPlus,
  UserCheck,
  EyeOff,
  ChevronRight,
  TrendingUp,
  Cpu,
  Globe2,
  Palette,
  Compass,
  Zap,
} from 'lucide-react';

export interface OnboardingSubtopic {
  id: string;
  name: string;
  slug: string;
  tags?: string[];
}

export interface OnboardingCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  subtopics: OnboardingSubtopic[];
}

export interface OnboardingCreator {
  id: string;
  name: string | null;
  slug?: string | null;
  subdomain?: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified?: boolean;
}

export interface OnboardingSubmitData {
  interests: string[];
  subtopics?: string[];
  onboardingText?: string;
  mutedWords: string[];
  creatorsToFollow: string[];
  gender?: string;
  ageRange?: string;
  pronouns?: string;
}

export interface OnboardingFlowProps {
  categories: OnboardingCategory[];
  suggestedCreators: OnboardingCreator[];
  onSubmit: (data: OnboardingSubmitData) => Promise<unknown>;
  onDone?: () => void;
}

const getGenderOptions = () => [
  { value: 'FEMALE', label: t`Femme` },
  { value: 'MALE', label: t`Homme` },
  { value: 'NON_BINARY', label: t`Non-binaire` },
  { value: 'OTHER', label: t`Autre` },
  { value: 'PREFER_NOT_TO_SAY', label: t`Préfère ne pas dire` },
];

const getAgeRangeOptions = () => [
  { value: 'UNDER_18', label: t`Moins de 18 ans` },
  { value: 'AGE_18_24', label: t`18-24 ans` },
  { value: 'AGE_25_34', label: t`25-34 ans` },
  { value: 'AGE_35_44', label: t`35-44 ans` },
  { value: 'AGE_45_54', label: t`45-54 ans` },
  { value: 'AGE_55_64', label: t`55-64 ans` },
  { value: 'AGE_65_PLUS', label: t`65 ans et +` },
  { value: 'PREFER_NOT_TO_SAY', label: t`Préfère ne pas dire` },
];

const POPULAR_MUTED_SUGGESTIONS = [
  'crypto',
  'nft',
  'publicité',
  'buzz',
  'clash',
  'faits divers',
  'politique partisane',
  'putaclic',
];

const getCategoryIcon = (iconName?: string) => {
  switch (iconName) {
    case 'Cpu':
      return <Cpu className="w-4 h-4 text-primary" />;
    case 'TrendingUp':
      return <TrendingUp className="w-4 h-4 text-primary" />;
    case 'Globe2':
      return <Globe2 className="w-4 h-4 text-primary" />;
    case 'Palette':
      return <Palette className="w-4 h-4 text-primary" />;
    case 'Compass':
      return <Compass className="w-4 h-4 text-primary" />;
    case 'Sparkles':
    default:
      return <Sparkles className="w-4 h-4 text-primary" />;
  }
};

export function OnboardingFlow({
  categories,
  suggestedCreators,
  onSubmit,
  onDone,
}: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Gamification state
  const [selectedMacroTopics, setSelectedMacroTopics] = useState<string[]>([]);
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [mutedWords, setMutedWords] = useState<string[]>([]);
  const [mutedInput, setMutedInput] = useState('');
  const [followedCreators, setFollowedCreators] = useState<string[]>([]);
  const [gender, setGender] = useState<string | null>(null);
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [pronouns, setPronouns] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🎯 Endowed Progress Effect : Démarre à 25%, augmente dynamiquement avec chaque micro-action
  const progressPercent = useMemo(() => {
    let base = 25; // Never start at 0%
    if (step === 1) {
      base += Math.min(selectedMacroTopics.length * 5 + selectedSubtopics.length * 3, 25);
    } else if (step === 2) {
      base = 50 + (bio.length > 10 ? 10 : 0) + Math.min(followedCreators.length * 5, 15);
    } else if (step === 3) {
      base = 75 + Math.min(mutedWords.length * 5, 15);
    } else if (step === 4) {
      base = 95;
    }
    return Math.min(base, 100);
  }, [step, selectedMacroTopics, selectedSubtopics, bio, followedCreators, mutedWords]);

  // Toggle macro-topic
  const handleToggleMacro = (cat: OnboardingCategory) => {
    if (selectedMacroTopics.includes(cat.id)) {
      setSelectedMacroTopics((prev) => prev.filter((id) => id !== cat.id));
      // Nettoie aussi les sous-thèmes associés
      const subtopicIds = cat.subtopics.map((s) => s.id);
      setSelectedSubtopics((prev) => prev.filter((id) => !subtopicIds.includes(id)));
    } else {
      setSelectedMacroTopics((prev) => [...prev, cat.id]);
    }
  };

  // Toggle subtopic
  const handleToggleSubtopic = (subId: string) => {
    setSelectedSubtopics((prev) =>
      prev.includes(subId) ? prev.filter((id) => id !== subId) : [...prev, subId]
    );
  };

  // Toggle quick muted words
  const handleToggleMutedWord = (word: string) => {
    const clean = word.toLowerCase().trim();
    if (mutedWords.includes(clean)) {
      setMutedWords((prev) => prev.filter((w) => w !== clean));
    } else {
      setMutedWords((prev) => [...prev, clean]);
    }
  };

  const handleAddCustomMutedWord = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = mutedInput.toLowerCase().trim();
    if (clean && !mutedWords.includes(clean)) {
      setMutedWords((prev) => [...prev, clean]);
      setMutedInput('');
    }
  };

  const handleToggleCreator = (creatorId: string) => {
    setFollowedCreators((prev) =>
      prev.includes(creatorId) ? prev.filter((id) => id !== creatorId) : [...prev, creatorId]
    );
  };

  const handleNext = () => {
    if (step === 1 && selectedMacroTopics.length < 2) {
      setError(t`Sélectionnez au moins 2 univers pour débuter.`);
      return;
    }
    setError(null);
    setStep((prev) => (prev + 1) as 1 | 2 | 3 | 4);
  };

  const handleBack = () => {
    setError(null);
    setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      await onSubmit({
        interests: selectedMacroTopics,
        subtopics: selectedSubtopics,
        onboardingText: bio,
        mutedWords,
        creatorsToFollow: followedCreators,
        gender: gender || undefined,
        ageRange: ageRange || undefined,
        pronouns: pronouns.trim() || undefined,
      });

      if (onDone) {
        onDone();
      } else {
        router.push('/home');
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t`Erreur lors de la configuration.`;
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="w-full rounded-[36px] bg-[#EE4B2B] p-2 md:p-3 shadow-2xl border-0">
      <div className="w-full flex flex-col md:flex-row min-h-[640px] md:h-[640px] gap-2 md:gap-3">
        {/* Left Side: Interactive Area */}
        <div className="flex-1 md:basis-[60%] bg-card text-card-foreground rounded-[26px] overflow-hidden shadow-lg border border-border/40 flex flex-col">
          <div className="w-full h-full flex flex-col justify-between p-6 md:p-10 relative overflow-y-auto">
            {/* Header & Gamified Progress */}
            <div>
              {/* Progress Bar with Endowed Progress */}
              <div className="mb-6">
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className="flex items-center gap-1.5 text-foreground font-sans text-[11px] font-semibold uppercase tracking-wider">
                    <Zap className="w-3.5 h-3.5 text-[#EE4B2B] fill-[#EE4B2B]" />
                    {t`Sanctuaire configuré à ${progressPercent}%`}
                  </span>
                  <span className="text-muted-foreground font-sans text-[11px] font-medium">
                    {t`Étape ${step}/4`}
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: '25%' }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  />
                </div>
              </div>

              {/* Step Titles */}
              <div className="mb-5">
                <h2 className="text-2xl font-bold tracking-tight text-foreground mb-1">
                  {step === 1 && t`Choisissez vos univers de prédilection`}
                  {step === 2 && t`Votre intention & vos créateurs alliés`}
                  {step === 3 && t`Préservez votre attention (Filtre Zen)`}
                  {step === 4 && t`Personnalisation finale (Optionnel)`}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {step === 1 &&
                    t`Cliquez sur un univers pour débloquer des sujets d'exploration plus pointus.`}
                  {step === 2 &&
                    t`Décrivez votre quête de lecture et découvrez des créateurs recommandés pour vous.`}
                  {step === 3 &&
                    t`Écartez en 1 clic les thèmes qui polluent votre réflexion. Zéro bruit.`}
                  {step === 4 &&
                    t`Aidez-nous à calibrer une expérience inclusive, ou terminez directement.`}
                </p>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 mb-4 bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded-xl flex items-center gap-2"
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              {/* STEP 1: Macro topics + Inline Cascading Subtopics */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {categories.map((cat) => {
                      const isSelected = selectedMacroTopics.includes(cat.id);
                      return (
                        <motion.div
                          key={cat.id}
                          layout
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                          className={cn(
                            'rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col',
                            isSelected
                              ? 'bg-[#EE4B2B]/5 border-[#EE4B2B]/80 shadow-xs'
                              : 'bg-muted/40 border-border/60 hover:bg-muted/70'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleMacro(cat)}
                            className="p-3.5 text-left flex items-center justify-between w-full cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              {getCategoryIcon(cat.icon)}
                              <span
                                className={cn(
                                  'text-xs font-sans',
                                  isSelected
                                    ? 'font-semibold text-foreground'
                                    : 'text-muted-foreground'
                                )}
                              >
                                {cat.name}
                              </span>
                            </div>
                            <div
                              className={cn(
                                'w-4 h-4 rounded-full flex items-center justify-center transition-colors shrink-0',
                                isSelected
                                  ? 'bg-[#EE4B2B] text-white'
                                  : 'border border-border bg-card'
                              )}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                          </button>

                          {/* Subtopics directly expanding within the parent category card */}
                          <AnimatePresence>
                            {isSelected && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                                className="px-3 pb-3 pt-1 border-t border-[#EE4B2B]/15 bg-background/50"
                              >
                                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-[#EE4B2B]" />
                                  {t`Sujets d'exploration`}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {cat.subtopics.map((sub) => {
                                    const isSubSelected = selectedSubtopics.includes(sub.id);
                                    return (
                                      <button
                                        key={sub.id}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleSubtopic(sub.id);
                                        }}
                                        className={cn(
                                          'px-2.5 py-1 rounded-full text-[11px] font-sans transition-all flex items-center gap-1 border cursor-pointer',
                                          isSubSelected
                                            ? 'bg-foreground text-background border-foreground font-medium shadow-xs'
                                            : 'bg-card text-muted-foreground border-border/80 hover:text-foreground hover:border-foreground/40'
                                        )}
                                      >
                                        <span>{sub.name}</span>
                                        {isSubSelected && (
                                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 2: Intention & Adaptive Creators */}
              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <label className="text-[11px] font-sans uppercase tracking-wider text-muted-foreground block mb-2 font-semibold">
                      {t`Quels types d'analyses recherchez-vous ?`}
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setBio(e.target.value)
                      }
                      placeholder={t`ex: Je souhaite suivre l'indépendance technologique européenne, les essais philosophiques sur l'attention et des enquêtes économiques...`}
                      rows={3}
                      className="w-full rounded-2xl bg-muted/40 border border-border text-xs resize-none p-3.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#EE4B2B]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[11px] font-sans uppercase tracking-wider text-muted-foreground font-semibold">
                        {t`Créateurs suggérés d'après vos choix`}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-sans font-medium">
                        {t`${followedCreators.length} suivi(s)`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[190px] overflow-y-auto p-1">
                      {suggestedCreators.map((creator) => {
                        const isFollowed = followedCreators.includes(creator.id);
                        return (
                          <div
                            key={creator.id}
                            className={cn(
                              'p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all',
                              isFollowed
                                ? 'bg-primary/5 border-primary/40'
                                : 'bg-muted/30 border-border/60'
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-muted relative shrink-0 border border-border/80">
                                {creator.logoUrl ? (
                                  <Image
                                    src={creator.logoUrl}
                                    alt={creator.name || t`Creator`}
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center font-bold text-xs font-sans">
                                    {creator.name?.charAt(0) || t`C`}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground truncate">
                                  {creator.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {creator.heroText || `@${creator.slug}`}
                                </p>
                              </div>
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              variant={isFollowed ? 'secondary' : 'default'}
                              onClick={() => handleToggleCreator(creator.id)}
                              className={cn(
                                'h-7 px-2.5 rounded-xl text-[11px] shrink-0 font-medium',
                                isFollowed
                                  ? 'bg-muted text-foreground'
                                  : 'bg-[#EE4B2B] hover:bg-[#d63d20] text-white'
                              )}
                            >
                              {isFollowed ? (
                                <UserCheck className="w-3 h-3 text-primary" />
                              ) : (
                                <UserPlus className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Filtre Zen (Muted words) */}
              {step === 3 && (
                <div className="space-y-5">
                  <div>
                    <span className="text-[11px] font-sans uppercase tracking-wider text-muted-foreground block mb-2 font-semibold">
                      {t`Suggestions de filtres anti-bruit`}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {POPULAR_MUTED_SUGGESTIONS.map((suggestion) => {
                        const isMuted = mutedWords.includes(suggestion);
                        return (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => handleToggleMutedWord(suggestion)}
                            className={cn(
                              'px-3 py-1.5 rounded-full text-xs border transition-all flex items-center gap-1.5',
                              isMuted
                                ? 'bg-destructive/15 border-destructive text-destructive font-medium'
                                : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <EyeOff className="w-3 h-3" />
                            <span>{suggestion}</span>
                            {isMuted && <Check className="w-3 h-3 stroke-[3]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-sans uppercase tracking-wider text-muted-foreground block mb-2 font-semibold">
                      {t`Ajouter vos propres mots ou sujets masqués`}
                    </span>
                    <form onSubmit={handleAddCustomMutedWord} className="flex gap-2">
                      <Input
                        value={mutedInput}
                        onChange={(e) => setMutedInput(e.target.value)}
                        placeholder={t`ex: télé-réalité, spoils, etc.`}
                        className="rounded-xl bg-muted/40 border-border text-xs h-10"
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        className="rounded-xl text-xs px-4 h-10 shrink-0 font-sans"
                      >
                        {t`Ajouter`}
                      </Button>
                    </form>
                  </div>
                </div>
              )}

              {/* STEP 4: Demographics / Identity (Optional) */}
              {step === 4 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-sans uppercase tracking-wider font-bold text-muted-foreground block mb-1.5">
                      {t`Tranche d'âge`}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {getAgeRangeOptions().map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setAgeRange(opt.value)}
                          className={cn(
                            'p-2 rounded-xl text-xs border transition-all truncate text-center',
                            ageRange === opt.value
                              ? 'bg-foreground text-background border-foreground font-medium'
                              : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-sans uppercase tracking-wider font-bold text-muted-foreground block mb-1.5">
                      {t`Genre`}
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                      {getGenderOptions().map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setGender(opt.value)}
                          className={cn(
                            'p-2 rounded-xl text-xs border transition-all truncate text-center',
                            gender === opt.value
                              ? 'bg-foreground text-background border-foreground font-medium'
                              : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-sans uppercase tracking-wider font-bold text-muted-foreground block mb-1">
                      {t`Vos pronoms`}
                    </label>
                    <Input
                      value={pronouns}
                      onChange={(e) => setPronouns(e.target.value)}
                      placeholder={t`ex: iel, il/lui, elle, they/them`}
                      className="rounded-xl bg-muted/40 border-border text-xs h-9"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions Row */}
            <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
              {step > 1 ? (
                <Button
                  onClick={handleBack}
                  variant="ghost"
                  disabled={loading}
                  className="rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  {t`Retour`}
                </Button>
              ) : (
                <div />
              )}

              {step < 4 ? (
                <Button
                  onClick={handleNext}
                  className="rounded-xl px-5 bg-[#EE4B2B] hover:bg-[#d63d20] text-white font-semibold text-xs transition-all shadow-sm flex items-center gap-1"
                >
                  <span>{t`Continuer`}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="rounded-xl px-6 bg-[#EE4B2B] hover:bg-[#d63d20] text-white font-semibold text-xs transition-all shadow-md flex items-center gap-1.5"
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {t`Accéder à mon Sanctuaire`}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Editorial Branding & Values */}
        <div className="hidden md:flex flex-1 md:basis-[40%] bg-[#EE4B2B] text-white p-8 rounded-[26px] flex-col justify-between overflow-hidden">
          <Logo className="h-8 w-auto opacity-95" fillColor="#FFFFFF" />

          <div className="mt-auto relative w-full text-white">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col justify-end"
              >
                <p className="text-white/60 text-[10px] uppercase tracking-[0.2em] font-sans font-semibold mb-2">
                  {step === 1 && t`SANCTUAIRE DE LECTURE`}
                  {step === 2 && t`INTELLIGENCE ALGORITHMIQUE SOUVERAINE`}
                  {step === 3 && t`DÉSINTOXICATION NUMÉRIQUE`}
                  {step === 4 && t`COMMUNAUTÉ OUVERTE`}
                </p>
                <h3 className="text-white text-2xl font-bold tracking-tight leading-tight mb-3">
                  {step === 1 && t`Le temps long, réinventé.`}
                  {step === 2 && t`Des écrits qui résonnent.`}
                  {step === 3 && t`Reprenez le contrôle.`}
                  {step === 4 && t`Bienvenue chez vous.`}
                </h3>
                <p className="text-white/80 text-xs leading-relaxed">
                  {step === 1 &&
                    t`Votre sélection calibre l'embedding sémantique de votre sanctuaire sans publicité ni profilage commercial.`}
                  {step === 2 &&
                    t`Chaque publication suivie finance directement son auteur dans un écosystème respectueux de la vie privée.`}
                  {step === 3 &&
                    t`Bannissez les distractions. Lisez avec calme, concentration et profondeur.`}
                  {step === 4 &&
                    t`Votre profil est désormais prêt pour explorer les meilleures publications d'Europe.`}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
