'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { createClient } from '@qoe/supabase/client';
import { t } from '@lingui/core/macro';
// Sous-chemin constants : évite la validation d'env (Zod) déclenchée par le barrel.
import { URLS } from '@qoe/config/constants';
import { cn } from '@qoe/utils';
import { BentoPlateau, BentoItem } from './ui/BentoPlateau';
import { Logo } from './Logo';
import { Button } from './ui/button';
import type { AuthActionContext } from './GuestFloatingBar';

export interface LoginFormBentoProps {
  initialMode?: 'login' | 'signup' | 'magic-link';
  actionContext?: AuthActionContext;
  onSuccess?: () => void;
  showLanguageSwitch?: boolean;
  className?: string;
}

// ── Démographie signup (optionnelle, jamais obligatoire) ────────────────
// Les valeurs correspondent aux enums Prisma (Gender / AgeRange).
// Les options démographiques sont construites au rendu (fonctions) pour que
// les traductions suivent la langue active — un tableau évalué au module
// resterait figé dans la langue par défaut.
const getGenderOptions = (): Array<{ value: string; label: string }> => [
  { value: 'FEMALE', label: t`Femme` },
  { value: 'MALE', label: t`Homme` },
  { value: 'NON_BINARY', label: t`Non-binaire` },
  { value: 'OTHER', label: t`Autre` },
  { value: 'PREFER_NOT_TO_SAY', label: t`Préfère ne pas dire` },
];

const getAgeRangeOptions = (): Array<{ value: string; label: string }> => [
  { value: 'UNDER_18', label: t`Moins de 18 ans` },
  { value: 'AGE_18_24', label: t`18-24 ans` },
  { value: 'AGE_25_34', label: t`25-34 ans` },
  { value: 'AGE_35_44', label: t`35-44 ans` },
  { value: 'AGE_45_54', label: t`45-54 ans` },
  { value: 'AGE_55_64', label: t`55-64 ans` },
  { value: 'AGE_65_PLUS', label: t`65 ans et +` },
  { value: 'PREFER_NOT_TO_SAY', label: t`Préfère ne pas dire` },
];

const PRONOUN_SUGGESTIONS = ['iel', 'il/lui', 'elle', 'they/them', 'on'];

export function LoginFormBento({
  initialMode = 'login',
  actionContext,
  onSuccess,
  className,
}: LoginFormBentoProps) {
  const [authMode, setAuthMode] = useState<'magic-link' | 'password' | 'signup'>(
    initialMode === 'signup' ? 'signup' : 'magic-link'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [pronouns, setPronouns] = useState('');
  const [showDemographics, setShowDemographics] = useState(false);
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [manifestoIdx, setManifestoIdx] = useState(0);

  // ── Méthodes de connexion pilotées par l'admin (SystemConfig AUTH_METHODS) ──
  // Google/Apple sont en phase de test : le superadmin active/désactive chaque
  // méthode depuis /admin/config. Clé absente ou invalide → tout activé.
  const [authMethods, setAuthMethods] = useState<{
    google: boolean;
    apple: boolean;
    password: boolean;
    magicLink: boolean;
  } | null>(null);

  // ── Inscriptions fermées (SystemConfig ALLOW_NEW_REGISTRATIONS=false) ──
  // Le superadmin ferme la création de comptes depuis /admin/config : on
  // masque le lien « S'inscrire » et on replie un signup déjà ouvert vers la
  // connexion. L'API refuse de toute façon la création (403 SyncUserFromAuth).
  const [registrationsClosed, setRegistrationsClosed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${URLS.API}/v1/home/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg: Record<string, string> | null) => {
        if (cancelled || !cfg) return;
        if (cfg.ALLOW_NEW_REGISTRATIONS === 'false') {
          setRegistrationsClosed(true);
        }
        if (!cfg.AUTH_METHODS) return;
        try {
          const parsed = JSON.parse(cfg.AUTH_METHODS) as Partial<Record<string, boolean>>;
          setAuthMethods({
            google: parsed.google !== false,
            apple: parsed.apple !== false,
            password: parsed.password !== false,
            magicLink: parsed.magicLink !== false,
          });
        } catch {
          // JSON invalide → défaut (tout activé)
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Quand les méthodes chargent (ou que les inscriptions ferment), on repasse
  // sur un mode encore disponible.
  useEffect(() => {
    if (registrationsClosed && authMode === 'signup') {
      setAuthMode(authMethods?.magicLink ? 'magic-link' : 'password');
      return;
    }
    if (!authMethods) return;
    setAuthMode((current) => {
      if (current === 'signup' && !authMethods.password) {
        return authMethods.magicLink ? 'magic-link' : 'password';
      }
      if (current === 'magic-link' && !authMethods.magicLink && authMethods.password) {
        return 'password';
      }
      if (current === 'password' && !authMethods.password && authMethods.magicLink) {
        return 'magic-link';
      }
      return current;
    });
  }, [authMethods, registrationsClosed, authMode]);

  useEffect(() => {
    setAuthMode(initialMode === 'signup' ? 'signup' : 'magic-link');
    setLocalError(null);
    setMagicLinkSent(false);
  }, [initialMode]);

  const getContextSubtitle = () => {
    if (actionContext === 'like')
      return t`Connectez-vous pour aimer ce post et soutenir cet auteur`;
    if (actionContext === 'follow')
      return t`Abonnez-vous à cet auteur pour ne rater aucun de ses écrits`;
    if (actionContext === 'bookmark')
      return t`Enregistrez cet écrit dans votre sanctuaire de lecture`;
    if (actionContext === 'comment') return t`Rejoignez la conversation et répondez à l'auteur`;
    if (actionContext === 'repost') return t`Partagez ce post avec vos abonnés`;
    if (actionContext === 'delete')
      return t`Connectez-vous pour gérer et supprimer vos propres publications`;
    if (authMode === 'signup')
      return t`Rejoignez le réseau souverain — un seul formulaire, quelques secondes`;
    return t`Accédez à votre espace souverain`;
  };

  const manifestoMessages = [
    {
      target: t`Créateurs`,
      title: t`Reprenez le contrôle \nde votre audience.`,
      desc: t`Pas de publicités. Pas d'algorithmes opaques. Juste vous et vos lecteurs, sur une infrastructure souveraine.`,
    },
    {
      target: t`Lecteurs`,
      title: t`Retrouvez le goût \ndu temps long.`,
      desc: t`Un sanctuaire dédié à la lecture profonde. Fuyez le bruit constant, cultivez le silence et choisissez qui vous influence.`,
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setManifestoIdx((prev) => (prev === 0 ? 1 : 0));
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const supabase = createClient();

  const handleOAuth = async (provider: 'google' | 'apple') => {
    try {
      setLoading(true);
      setLocalError(null);
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.href)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t`Une erreur est survenue.`;
      setLocalError(message);
      setLoading(false);
    }
  };

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      setLoading(true);
      setLocalError(null);
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.href)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
      });
      if (error) throw error;
      setMagicLinkSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t`Une erreur est survenue.`;
      setLocalError(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalError(null);

    try {
      if (authMode === 'signup') {
        if (!name.trim() || !username.trim()) {
          setLocalError(t`Veuillez renseigner votre nom et nom d'utilisateur.`);
          setLoading(false);
          return;
        }
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setLocalError(t`Veuillez renseigner une adresse email valide.`);
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setLocalError(t`Votre mot de passe doit contenir au moins 8 caractères.`);
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
              username,
              gender: gender || undefined,
              ageRange: ageRange || undefined,
              pronouns: pronouns.trim() || undefined,
            },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }

      if (authMode === 'signup') {
        window.location.href = '/onboarding';
      } else if (onSuccess) {
        onSuccess();
      } else {
        const urlParams = new URLSearchParams(window.location.search);
        const next = urlParams.get('redirect') || urlParams.get('next') || '/home';
        window.location.href = next;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t`Erreur d'authentification.`;
      setLocalError(message);
    } finally {
      setLoading(false);
    }
  };

  const slideVariants = {
    enter: { x: 30, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -30, opacity: 0 },
  };

  // Méthodes effectives : défaut « tout activé » tant que la config n'a pas chargé.
  const methods = authMethods ?? { google: true, apple: true, password: true, magicLink: true };

  return (
    <BentoPlateau
      className={cn(
        'md:h-[620px] shadow-2xl rounded-3xl overflow-hidden bg-[#EE4B2B] p-2 md:p-3 border-0',
        className
      )}
    >
      {/* Auth Side (Left) */}
      <BentoItem
        active={true}
        flexBasisActive="55%"
        innerClassName="bg-card text-card-foreground rounded-2xl shadow-lg border border-border/40"
      >
        <div className="w-full h-full flex flex-col items-center justify-between p-6 md:p-10 relative bg-card text-card-foreground">
          <div className="w-full max-w-md my-auto">
            {/* Header */}
            <div className="mb-4 text-center">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 text-card-foreground">
                {authMode === 'signup' ? t`Créer un compte` : t`Connexion`}
              </h2>
              <p className="text-muted-foreground text-xs md:text-sm">{getContextSubtitle()}</p>
            </div>

            {/* Error display */}
            {localError && (
              <div className="p-3 mb-4 bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">{localError}</div>
              </div>
            )}

            {/* Magic Link Success */}
            {magicLinkSent ? (
              <div className="text-center py-6 space-y-4 animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-success/10 border border-success/30 rounded-full flex items-center justify-center mx-auto text-success text-2xl shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                  ✓
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-success">{t`Lien magique envoyé`}</h3>
                  <p className="text-muted-foreground text-xs leading-relaxed px-4">
                    {t`Consultez votre boîte mail et cliquez sur le lien pour vous connecter.`}
                  </p>
                </div>
                <Button
                  onClick={() => setMagicLinkSent(false)}
                  variant="outline"
                  className="mt-4 text-xs font-mono border-border text-muted-foreground hover:text-foreground"
                >
                  {t`Retour`}
                </Button>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={authMode}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="space-y-4"
                >
                  {/* Social Logins - One-Click (Google/Apple) */}
                  {(methods.google || methods.apple) && (
                    <>
                      <div
                        className={cn(
                          'grid gap-3',
                          methods.google && methods.apple ? 'grid-cols-2' : 'grid-cols-1'
                        )}
                      >
                        {methods.google && (
                          <button
                            type="button"
                            onClick={() => handleOAuth('google')}
                            className="w-full flex items-center p-1.5 rounded-2xl bg-muted/60 hover:bg-muted border border-border/80 transition-all group cursor-pointer"
                          >
                            <div className="w-9 h-9 bg-card rounded-xl flex items-center justify-center shadow-xs border border-border group-hover:scale-105 transition-transform shrink-0">
                              <svg className="w-4 h-4 text-card-foreground" viewBox="0 0 24 24">
                                <path
                                  fill="currentColor"
                                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                />
                                <path
                                  fill="currentColor"
                                  fillOpacity="0.5"
                                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                />
                                <path
                                  fill="currentColor"
                                  fillOpacity="0.3"
                                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                                />
                                <path
                                  fill="currentColor"
                                  fillOpacity="0.6"
                                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                                />
                              </svg>
                            </div>
                            <div className="flex-1 flex items-center justify-center pr-2">
                              <span className="text-[12px] font-semibold text-card-foreground/80 group-hover:text-card-foreground transition-colors">
                                Google
                              </span>
                            </div>
                          </button>
                        )}

                        {methods.apple && (
                          <button
                            type="button"
                            onClick={() => handleOAuth('apple')}
                            className="w-full flex items-center p-1.5 rounded-2xl bg-muted/60 hover:bg-muted border border-border/80 transition-all group cursor-pointer"
                          >
                            <div className="w-9 h-9 bg-card rounded-xl flex items-center justify-center shadow-xs border border-border group-hover:scale-105 transition-transform shrink-0">
                              <svg
                                className="w-4 h-4 text-card-foreground"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.48C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.1 16.67C20.08 16.74 19.67 18.11 18.71 19.5M15.97 4.17C16.63 3.37 17.07 2.28 16.95 1C16 1.04 14.9 1.6 14.24 2.38C13.68 3.04 13.19 4.14 13.34 5.39C14.39 5.47 15.4 4.88 15.97 4.17Z" />
                              </svg>
                            </div>
                            <div className="flex-1 flex items-center justify-center pr-2">
                              <span className="text-[12px] font-semibold text-card-foreground/80 group-hover:text-card-foreground transition-colors">
                                Apple
                              </span>
                            </div>
                          </button>
                        )}
                      </div>

                      {/* Separator */}
                      <div className="flex items-center gap-4 my-3 opacity-60">
                        <div className="flex-1 h-px bg-border"></div>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                          {t`Ou`}
                        </span>
                        <div className="flex-1 h-px bg-border"></div>
                      </div>
                    </>
                  )}

                  {/* Form Content by Mode */}
                  {authMode === 'magic-link' && (
                    <form onSubmit={handleMagicLinkSubmit} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">
                          {t`Email`}
                        </label>
                        <input
                          type="email"
                          required
                          disabled={loading}
                          value={email}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setEmail(e.target.value)
                          }
                          placeholder={t`vous@exemple.com`}
                          className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-10 font-sans font-bold mt-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-all text-xs cursor-pointer shadow-md shadow-primary/20"
                      >
                        {loading ? t`Chargement...` : t`Recevoir un lien magique`}
                      </Button>
                    </form>
                  )}

                  {authMode === 'password' && (
                    <form onSubmit={handlePasswordSubmit} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">
                          {t`Email`}
                        </label>
                        <input
                          name="email"
                          type="email"
                          required
                          value={email}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setEmail(e.target.value)
                          }
                          placeholder={t`vous@exemple.com`}
                          className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">
                          {t`Mot de passe`}
                        </label>
                        <input
                          name="password"
                          type="password"
                          required
                          value={password}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setPassword(e.target.value)
                          }
                          placeholder="••••••••"
                          className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-10 font-sans font-bold mt-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-all text-xs cursor-pointer shadow-md shadow-primary/20"
                      >
                        {loading ? t`Chargement...` : t`Se connecter`}
                      </Button>
                    </form>
                  )}

                  {authMode === 'signup' && (
                    <form onSubmit={handlePasswordSubmit} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">
                          {t`Nom complet`}
                        </label>
                        <input
                          name="name"
                          type="text"
                          required
                          value={name}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setName(e.target.value)
                          }
                          placeholder={t`Marc Dutronc`}
                          className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">
                          {t`Nom d'utilisateur`}
                        </label>
                        <input
                          name="username"
                          type="text"
                          required
                          value={username}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setUsername(e.target.value)
                          }
                          placeholder={t`@marcdutronc`}
                          className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">
                          {t`Adresse Email`}
                        </label>
                        <input
                          name="email"
                          type="email"
                          required
                          value={email}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setEmail(e.target.value)
                          }
                          placeholder="vous@exemple.com"
                          className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">
                          {t`Mot de passe`}
                        </label>
                        <input
                          name="password"
                          type="password"
                          required
                          value={password}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setPassword(e.target.value)
                          }
                          placeholder="••••••••"
                          className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>

                      {/* Démographie optionnelle — repliée par défaut pour zéro friction */}
                      <div className="rounded-xl border border-border/60 bg-muted/20">
                        <button
                          type="button"
                          onClick={() => setShowDemographics((v) => !v)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors cursor-pointer hover:bg-muted/40"
                          aria-expanded={showDemographics}
                        >
                          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                            {t`Votre profil (optionnel)`}
                          </span>
                          <ChevronDown
                            className={cn(
                              'w-4 h-4 text-muted-foreground transition-transform duration-200',
                              showDemographics && 'rotate-180'
                            )}
                          />
                        </button>

                        {showDemographics && (
                          <div className="px-3 pb-3 pt-3 border-t border-border/60 space-y-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                                {t`Qu'est-ce qui vous décrit le mieux ?`}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {getGenderOptions().map((opt) => {
                                  const selected = gender === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => setGender(selected ? null : opt.value)}
                                      className={cn(
                                        'px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-all cursor-pointer',
                                        selected
                                          ? 'bg-primary/10 border-primary text-primary'
                                          : 'bg-muted/30 border-border text-muted-foreground hover:text-card-foreground'
                                      )}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div>
                              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                                {t`Votre tranche d'âge`}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {getAgeRangeOptions().map((opt) => {
                                  const selected = ageRange === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => setAgeRange(selected ? null : opt.value)}
                                      className={cn(
                                        'px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-all cursor-pointer',
                                        selected
                                          ? 'bg-primary/10 border-primary text-primary'
                                          : 'bg-muted/30 border-border text-muted-foreground hover:text-card-foreground'
                                      )}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">
                                {t`Vos pronoms (optionnel)`}
                              </label>
                              <input
                                name="pronouns"
                                type="text"
                                value={pronouns}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setPronouns(e.target.value)
                                }
                                placeholder={t`ex: iel, il/lui, elle, they/them`}
                                className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                              />
                              <div className="flex flex-wrap gap-1 pt-1.5">
                                {PRONOUN_SUGGESTIONS.map((p) => (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPronouns(p)}
                                    className="px-2 py-0.5 rounded-md bg-muted/40 border border-border/60 text-[10px] text-muted-foreground hover:text-card-foreground transition-colors cursor-pointer"
                                  >
                                    {p}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-10 font-sans font-bold mt-1 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-all text-xs cursor-pointer shadow-md shadow-primary/20"
                      >
                        {loading ? t`Chargement...` : t`S'inscrire`}
                      </Button>
                    </form>
                  )}

                  {/* Toggle standard/magic auth mode */}
                  {methods.magicLink && methods.password && (
                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (authMode === 'magic-link') {
                            setAuthMode('password');
                          } else {
                            setAuthMode('magic-link');
                          }
                        }}
                        className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-card-foreground transition-colors cursor-pointer"
                      >
                        {authMode === 'magic-link'
                          ? t`Se connecter par mot de passe`
                          : t`Se connecter par lien magique`}
                      </button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Footer Switch (masqué quand les inscriptions sont fermées) */}
          {methods.password && !registrationsClosed && (
            <div className="w-full flex items-center justify-between pt-4 border-t border-border/40 text-xs">
              <button
                type="button"
                onClick={() => {
                  setLocalError(null);
                  setAuthMode(authMode === 'signup' ? 'magic-link' : 'signup');
                }}
                className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-card-foreground transition-colors cursor-pointer"
              >
                {authMode === 'signup'
                  ? t`Déjà un compte ? Connexion`
                  : t`Pas encore de compte ? S'inscrire`}
              </button>
            </div>
          )}
        </div>
      </BentoItem>

      {/* Branding Side (Right) */}
      <BentoItem
        active={false}
        flexBasisInactive="45%"
        className="bg-[#EE4B2B] text-white border-0 hidden md:block overflow-hidden"
        inactiveContent={
          <div className="w-full h-full flex flex-col items-start justify-between">
            <Logo className="h-8 w-auto" fillColor="#FFFFFF" />

            <div className="mt-auto relative w-full h-[140px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={manifestoIdx}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="absolute inset-0 flex flex-col justify-end pb-2"
                >
                  <p className="text-white/80 text-[10px] uppercase tracking-[0.2em] font-bold mb-2">
                    {t`Pour les`} {manifestoMessages[manifestoIdx].target}
                  </p>
                  <h3 className="text-white text-2xl md:text-3xl font-bold tracking-tight leading-tight mb-3 whitespace-pre-line font-sans">
                    {manifestoMessages[manifestoIdx].title}
                  </h3>
                  <p className="text-white/90 text-xs md:text-sm max-w-sm leading-relaxed font-sans">
                    {manifestoMessages[manifestoIdx].desc}
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
  );
}
