'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { t } from '@lingui/core/macro';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@qoe/utils';
import { BentoPlateau, BentoItem } from '@qoe/ui/ui/BentoPlateau';
import { Logo } from '@qoe/ui/ui/Logo';
import { Button } from '@qoe/ui/ui/button';
import { Input } from '@qoe/ui/ui/input';
import { completeOnboarding } from './actions';
import {
  Check,
  X,
  ShieldAlert,
  Loader2,
  Sparkles,
  UserPlus,
  UserCheck,
  EyeOff,
} from 'lucide-react';

interface OnboardingFlowProps {
  categories: Array<{ id: string; name: string; slug: string }>;
  suggestedCreators: Array<{
    id: string;
    name: string | null;
    subdomain: string | null;
    logoUrl: string | null;
    heroText: string | null;
  }>;
  userId: string;
}

export function OnboardingFlow({ categories, suggestedCreators }: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('qoe_onboarding_step');
      return saved ? parseInt(saved, 10) || 1 : 1;
    }
    return 1;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Interests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  // Step 2: Biography / DNA
  const [bio, setBio] = useState('');

  // Step 3: Muted Words
  const [mutedWords, setMutedWords] = useState<string[]>([]);
  const [mutedInput, setMutedInput] = useState('');

  // Step 4: Creators to follow
  const [followedCreators, setFollowedCreators] = useState<string[]>([]);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('qoe_onboarding_step', String(step));
    }
  }, [step]);

  const handleToggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleAddMutedWord = (e: React.FormEvent) => {
    e.preventDefault();
    const word = mutedInput.trim().toLowerCase();
    if (word && !mutedWords.includes(word)) {
      setMutedWords((prev) => [...prev, word]);
      setMutedInput('');
    }
  };

  const handleRemoveMutedWord = (word: string) => {
    setMutedWords((prev) => prev.filter((w) => w !== word));
  };

  const handleToggleCreator = (id: string) => {
    setFollowedCreators((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleNext = () => {
    if (step === 1 && selectedInterests.length < 3) {
      setError(t`Veuillez sélectionner au moins 3 centres d'intérêt.`);
      return;
    }
    setError(null);
    setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setError(null);
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      await completeOnboarding({
        interests: selectedInterests,
        onboardingText: bio,
        mutedWords,
        creatorsToFollow: followedCreators,
      });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('qoe_onboarding_step');
      }
      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save preferences';
      setError(message);
      setLoading(false);
    }
  };

  // Right-side context information dependent on current step
  const getContextData = () => {
    switch (step) {
      case 1:
        return {
          label: t`Étape` + ' 1 / 4',
          title: t`Votre Sanctuaire commence ici.`,
          desc: t`Sélectionnez les matières et idées qui éveillent votre réflexion. Pas d'algorithmes publicitaires ou compulsifs, juste les thématiques que vous décidez d'explorer.`,
          footer: t`QOE.FI — ZÉRO ATTENTION COMMERCIALE`,
        };
      case 2:
        return {
          label: t`Étape` + ' 2 / 4',
          title: t`Profil & Alignement Thématique`,
          desc: t`Décrivez vos sujets d'intérêt et votre vision pour personnaliser les suggestions de publications et les recommandations de créateurs.`,
          footer: t`QOE.FI — ALIGNEMENT THÉMATIQUE SUR MESURE`,
        };
      case 3:
        return {
          label: t`Étape` + ' 3 / 4',
          title: t`Le Bouclier de l'Attention`,
          desc: t`Le bruit informationnel est le premier obstacle au temps long. En filtrant les concepts toxiques, vous reprenez le contrôle absolu de votre fil de lecture.`,
          footer: t`FILTRAGE SOUVERAIN AU NIVEAU DE L'ÉLECTRON`,
        };
      case 4:
      default:
        return {
          label: t`Étape` + ' 4 / 4',
          title: t`Souveraineté des Médias`,
          desc: t`Sur qoe.fi, les auteurs écrivent en toute indépendance, sans dépendre de régies publicitaires capitalistes ou d'intermédiaires. Suivez-les pour enrichir votre univers.`,
          footer: t`MODÈLE D'ABONNEMENT COMPATIBLE RGPD`,
        };
    }
  };

  const context = getContextData();

  return (
    <div className="w-full">
      <BentoPlateau className="md:h-[640px]">
        {/* Active Side (Left) */}
        <BentoItem
          active={true}
          flexBasisActive="58%"
          innerClassName="bg-card text-card-foreground"
        >
          <div className="w-full h-full flex flex-col justify-between p-8 md:p-12 relative overflow-y-auto">
            {/* Top Row: Title / Error Display */}
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-1">
                    {step === 1 && t`Qu'est-ce qui vous élève ?`}
                    {step === 2 && t`Détaillez vos lectures idéales.`}
                    {step === 3 && t`Préservez votre attention.`}
                    {step === 4 && t`Choisissez vos alliés.`}
                  </h2>
                  <p className="text-muted-foreground text-xs">
                    {step === 1 &&
                      t`Sélectionnez au moins 3 centres d'intérêt pour calibrer votre sanctuaire.`}
                    {step === 2 &&
                      t`Décrivez vos sujets favoris pour calibrer vos recommandations par IA.`}
                    {step === 3 && t`Bannissez les mots ou sujets qui polluent votre réflexion.`}
                    {step === 4 &&
                      t`Voici quelques créateurs certifiés qui correspondent à vos affinités.`}
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
                        const selected = selectedInterests.includes(cat.id);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => handleToggleInterest(cat.id)}
                            className={cn(
                              'flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all text-left group',
                              selected
                                ? 'bg-[#EE4B2B]/5 border-[#EE4B2B] text-[#EE4B2B] shadow-sm'
                                : 'bg-muted/50 hover:bg-muted/80 border-border text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <span className="truncate">{cat.name}</span>
                            <div
                              className={cn(
                                'w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0 ml-1.5',
                                selected
                                  ? 'bg-[#EE4B2B] border-[#EE4B2B] text-white'
                                  : 'border-border bg-card group-hover:border-border'
                              )}
                            >
                              {selected && <Check className="w-2.5 h-2.5" />}
                            </div>
                          </button>
                        );
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
                          placeholder={t`J'aime lire des articles sur l'émancipation économique, la sociologie...`}
                          rows={6}
                          className="w-full rounded-xl bg-muted/50 border border-border p-4 text-sm focus:outline-none focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] resize-none"
                        />
                        <div className="absolute bottom-3 right-3 text-[10px] text-muted-foreground font-mono">
                          {t`${bio.length} / 1000 caractères`}
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
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setMutedInput(e.target.value)
                          }
                          placeholder={t`Ex: Buzz, Polémique...`}
                          className="h-10 rounded-xl bg-muted/50 border-border flex-1"
                        />
                        <Button
                          type="submit"
                          className="h-10 px-4 rounded-xl bg-foreground hover:bg-foreground/90 text-background font-medium text-xs"
                        >
                          {t`+ Ajouter`}
                        </Button>
                      </form>

                      <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto p-1 border border-border rounded-lg bg-muted/30">
                        {mutedWords.length === 0 ? (
                          <div className="w-full text-center py-6 text-xs text-muted-foreground font-mono flex items-center justify-center gap-1.5">
                            <EyeOff className="w-3.5 h-3.5" />
                            {t`Aucun mot exclu pour le moment.`}
                          </div>
                        ) : (
                          mutedWords.map((word) => (
                            <span
                              key={word}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/60 text-foreground text-xs font-medium"
                            >
                              <span>{word}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveMutedWord(word)}
                                className="w-3.5 h-3.5 rounded-full hover:bg-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
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
                        const followed = followedCreators.includes(creator.id);
                        return (
                          <div
                            key={creator.id}
                            className={cn(
                              'p-3 rounded-xl border flex items-center gap-3 transition-colors',
                              followed ? 'bg-muted/50 border-border' : 'bg-muted/20 border-border'
                            )}
                          >
                            <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center overflow-hidden shrink-0">
                              {creator.logoUrl ? (
                                <Image
                                  src={creator.logoUrl}
                                  alt=""
                                  width={40}
                                  height={40}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="font-bold text-sm text-muted-foreground">
                                  {(creator.name || creator.id).slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-xs text-foreground truncate">
                                {creator.name || t`Auteur`}
                              </h4>
                              <p className="text-[10px] text-muted-foreground font-mono truncate">
                                @{creator.subdomain || 'creator'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleCreator(creator.id)}
                              className={cn(
                                'p-2 rounded-lg border flex items-center justify-center transition-colors shrink-0',
                                followed
                                  ? 'bg-success/10 border-success/20 text-success hover:bg-success/20'
                                  : 'bg-card hover:bg-muted border-border text-muted-foreground'
                              )}
                            >
                              {followed ? (
                                <UserCheck className="w-3.5 h-3.5" />
                              ) : (
                                <UserPlus className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom Actions Row */}
            <div className="flex items-center justify-between border-t border-border pt-6 mt-6">
              {step > 1 ? (
                <Button
                  onClick={handleBack}
                  variant="outline"
                  disabled={loading}
                  className="rounded-xl px-4 py-2 text-xs font-semibold"
                >
                  {t`Retour`}
                </Button>
              ) : (
                <div />
              )}

              {step < 4 ? (
                <Button
                  onClick={handleNext}
                  className="rounded-xl px-5 py-2 bg-[#EE4B2B] hover:bg-[#d63d20] text-white font-semibold text-xs transition-colors"
                >
                  {t`Continuer`}
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
                  {t`Entrer dans le sanctuaire`}
                </Button>
              )}
            </div>
          </div>
        </BentoItem>

        {/* Branding/Context Side (Right) */}
        <BentoItem
          active={false}
          flexBasisInactive="42%"
          inactiveContent={
            <div className="w-full h-full flex flex-col items-start justify-between">
              <Logo className="h-8 w-auto opacity-90" fillColor="#FFFFFF" />

              <div className="mt-auto relative w-full min-h-[140px] text-white">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
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
          }
        >
          <div />
        </BentoItem>
      </BentoPlateau>
    </div>
  );
}
