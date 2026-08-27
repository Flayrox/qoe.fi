'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  checkSubdomainAvailabilityAction as checkSubdomainAction,
  completeOnboardingAction,
} from '@qoe/sdk/actions/dashboard';

import { useRouter } from 'next/navigation';
import { toast } from '@qoe/ui/toast';
import {
  Loader2,
  ArrowRight,
  Globe,
  Home,
  FileText,
  Mail,
  Users,
  BarChart3,
  Settings,
  Plus,
} from 'lucide-react';
import { BentoPlateau, BentoItem } from '@qoe/ui/ui/BentoPlateau';

// Règles miroir de l'API Go (apps/api/internal/modules/settings/service.go) :
// on valide côté client, l'API tranche au final.
const SUBDOMAIN_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SUBDOMAINS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'blog',
  'dashboard',
  'dev',
  'developer',
  'docs',
  'feed',
  'help',
  'login',
  'main',
  'media',
  'onboarding',
  'portal',
  'qoe',
  'root',
  'settings',
  'start',
  'static',
  'status',
  'store',
  'studio',
  'support',
  'www',
]);

// Accroche par défaut générée — l'utilisateur la changera dans les réglages
// quand il aura envie. Pas de bio demandée à l'onboarding (friction inutile).
const DEFAULT_HERO = "Bienvenue dans mon espace d'écriture.";

/** Slugifie un texte (nom → sous-domaine candidat). */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/**
 * Résout silencieusement un sous-domaine disponible : slug du nom puis
 * variantes. L'utilisateur n'a rien à choisir — il verra l'adresse retenue
 * dans l'aperçu et pourra la changer dans les réglages ensuite.
 */
async function resolveAvailableSubdomain(base: string): Promise<string> {
  const candidates = [base, `${base}-1`, `${base}-2`, `${base}-3`, `${base}-blog`, `${base}-mag`]
    .filter((c) => c.length >= 3 && c.length <= 30)
    .filter((c) => SUBDOMAIN_REGEX.test(c) && !RESERVED_SUBDOMAINS.has(c))
    .filter((c, i, arr) => arr.indexOf(c) === i);

  for (const candidate of candidates) {
    try {
      const res = await checkSubdomainAction(candidate);
      if (res.ok && res.data.available) return candidate;
    } catch {
      /* on essaie la variante suivante */
    }
  }
  // Dernier recours : l'API refusera (index unique) → erreur gérée par l'appelant.
  return candidates[0] || 'mon-espace';
}

function MockDashboard() {
  return (
    <div className="absolute inset-0 w-full h-full bg-[#FCFBF9] flex overflow-hidden select-none pointer-events-none opacity-[0.22] dark:opacity-[0.1]">
      {/* Sidebar Mock */}
      <div className="w-64 border-r border-border/60 bg-white flex flex-col p-6 gap-6 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded bg-[#EE4B2B] flex items-center justify-center text-white font-serif font-black text-xs">
            q
          </div>
          <span className="font-sans text-sm font-semibold tracking-tight text-foreground">
            qoe.fi
          </span>
          <span className="text-[9px] uppercase tracking-wider bg-muted text-muted-foreground font-bold px-1.5 py-0.5 rounded">
            Console
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground mb-2 px-3">
            Plateforme
          </span>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted text-foreground text-xs font-semibold">
            <Home size={15} className="text-muted-foreground" /> Vue d'ensemble
          </div>
          {[
            { name: 'Écrits', icon: FileText },
            { name: 'Newsletters', icon: Mail },
            { name: 'Audience', icon: Users },
            { name: 'Statistiques', icon: BarChart3 },
            { name: 'Réglages', icon: Settings },
          ].map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground text-xs font-medium"
            >
              <item.icon size={15} className="text-muted-foreground" /> {item.name}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Mock */}
      <div className="flex-1 flex flex-col">
        {/* Header Mock */}
        <div className="h-16 border-b border-border/50 bg-white px-8 flex items-center justify-between">
          <div className="text-xs text-muted-foreground font-medium">
            Plateforme / Vue d'ensemble
          </div>
          <div className="w-8 h-8 rounded-full bg-muted" />
        </div>

        {/* Content Body Mock */}
        <div className="p-8 flex flex-col gap-6 flex-1">
          <div className="flex items-center justify-between">
            <div className="h-6 w-36 bg-muted rounded" />
            <div className="h-9 w-24 bg-muted rounded-lg flex items-center justify-center text-xs text-muted-foreground gap-1">
              <Plus size={14} /> Nouveau
            </div>
          </div>

          {/* Stats Cards Grid Mock */}
          <div className="grid grid-cols-3 gap-6">
            {[
              { label: 'Audience totale', value: '1,248', change: '+12%' },
              { label: "Taux d'ouverture", value: '68.4%', change: '+3.2%' },
              { label: 'Revenus (MRR)', value: '450 €', change: '+8%' },
            ].map((card, i) => (
              <div
                key={i}
                className="p-6 bg-white border border-border/60 rounded-xl flex flex-col gap-2"
              >
                <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
                <span className="text-2xl font-bold text-foreground">{card.value}</span>
                <span className="text-[10px] text-success font-bold bg-success/10 self-start px-2 py-0.5 rounded">
                  {card.change}
                </span>
              </div>
            ))}
          </div>

          {/* Chart & Activity Mock */}
          <div className="grid grid-cols-3 gap-6 flex-1 min-h-0">
            <div className="col-span-2 p-6 bg-white border border-border/60 rounded-xl flex flex-col gap-4">
              <div className="h-4 w-28 bg-muted rounded" />
              <div className="flex-1 w-full bg-muted rounded-lg border border-border flex items-end p-4 gap-3">
                {/* Simulated Chart Bars */}
                {[30, 45, 35, 60, 40, 75, 50, 90, 65, 85, 70, 95].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-[#EE4B2B]/20 hover:bg-[#EE4B2B]/30 rounded-t transition-all"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="p-6 bg-white border border-border/60 rounded-xl flex flex-col gap-4">
              <div className="h-4 w-28 bg-muted rounded" />
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="h-3 w-20 bg-muted rounded" />
                      <div className="h-2 w-12 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OnboardingWizard({ initialName = '' }: { initialName?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<'idle' | 'creating'>('idle');

  // Adresse générée automatiquement depuis le nom — modifiable ensuite dans
  // les réglages. C'est l'adresse affichée dans l'aperçu en temps réel.
  const slug = slugify(name.trim()) || slugify(initialName) || 'mon-espace';

  const handleLaunch = () => {
    if (status !== 'idle') return;
    if (!name.trim()) {
      toast.error('Ton nom est requis pour créer ton espace.');
      return;
    }

    setStatus('creating');
    startTransition(async () => {
      try {
        // 1. Sous-domaine disponible en silence (slug du nom ou variante).
        const subdomain = await resolveAvailableSubdomain(slug);
        // 2. Création express : pas de bio, thème minimal, tout modifiable
        //    plus tard dans les réglages.
        await completeOnboardingAction({
          name: name.trim(),
          heroText: DEFAULT_HERO,
          subdomain,
          layoutStyle: 'minimal',
        });
        // Petite pause pour laisser le temps à l'animation de génération.
        setTimeout(() => {
          router.push('/settings');
        }, 1400);
      } catch (err) {
        console.error(err);
        toast.error('Une erreur est survenue lors de la création de votre espace.', {
          description: 'Vérifiez votre connexion puis réessayez.',
        });
        setStatus('idle');
      }
    });
  };

  // Entrée pour lancer (sauf pendant la génération).
  // Pas de deps : on ré-enregistre à chaque rendu pour garder une closure
  // fraîche (handleLaunch lit name / status courants).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || status !== 'idle') return;
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      handleLaunch();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const previewStyle = { bg: '#ffffff', text: '#111827', accent: '#c5a880', font: 'font-sans' };

  return (
    <div className="relative flex h-screen w-full bg-[#FCFBF9] text-foreground overflow-hidden font-sans items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Background with Mock Dashboard and Blur */}
      <MockDashboard />
      <div className="absolute inset-0 z-10 bg-foreground/[0.02] backdrop-blur-[3.5px]" />

      <div className="relative z-20 w-full max-w-[95%] xl:max-w-6xl mx-auto animate-in fade-in zoom-in duration-500">
        <BentoPlateau className="min-h-[580px] md:h-[640px]">
          {/* Left Side: Instant Setup */}
          <BentoItem active={true} flexBasisActive="58%" innerClassName="bg-white text-foreground">
            <div className="w-full h-full flex flex-col justify-between p-8 md:p-12 relative min-h-[500px]">
              {/* Top qoe.fi signature */}
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EE4B2B] animate-pulse" />
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                    qoe.fi · Studio Setup
                  </span>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Configuration express
                </span>
              </div>

              {/* Instant setup content */}
              <div className="flex-1 flex flex-col justify-center py-6">
                <AnimatePresence mode="wait">
                  {status === 'idle' ? (
                    <motion.div
                      key="setup"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="max-w-md w-full"
                    >
                      <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">
                        Prêt à lancer ton espace ?
                      </h1>
                      <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
                        Ton adresse, ton thème et ta page d'accueil sont générés automatiquement. Tu
                        pourras tout modifier dans les réglages.
                      </p>

                      <div className="space-y-6">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Ton nom d'affichage
                          </label>
                          <input
                            type="text"
                            placeholder="Ton nom ou pseudo"
                            className="w-full bg-[#FAF9F6] border border-border rounded-lg p-4 text-foreground focus:outline-none focus:border-[#EE4B2B] focus:ring-1 focus:ring-[#EE4B2B] transition-all"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                          />
                        </div>

                        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                          <Globe size={14} className="text-[#EE4B2B] shrink-0" />
                          <span>
                            Ton adresse :{' '}
                            <span className="font-semibold text-foreground">{slug}.qoe.fi</span>{' '}
                            <span className="opacity-70">— modifiable plus tard</span>
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="generating"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.35 }}
                      className="flex flex-col items-center justify-center text-center w-full h-full py-12"
                    >
                      <Loader2 size={40} className="animate-spin text-[#EE4B2B] mb-6" />
                      <h1 className="text-2xl font-serif font-bold text-foreground mb-2">
                        Génération de ton Sanctuaire...
                      </h1>
                      <p className="text-muted-foreground text-sm">
                        Nous configurons ton sous-domaine, le design choisi et ton premier article
                        de bienvenue.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Launch CTA */}
              {status === 'idle' && (
                <div className="flex justify-between items-center shrink-0 pt-4 border-t border-border">
                  <p className="text-[11px] text-muted-foreground leading-snug max-w-[200px]">
                    Thème minimal + accroche par défaut. Tout se change dans les réglages.
                  </p>

                  <button
                    onClick={handleLaunch}
                    disabled={!name.trim()}
                    className="flex items-center bg-[#EE4B2B] hover:bg-[#d63d20] text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-red-500/10"
                  >
                    Lancer mon espace <ArrowRight size={14} className="ml-1.5" />
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
                  <span className="text-[9px] uppercase font-bold tracking-[0.15em]">
                    Aperçu en temps réel
                  </span>
                </div>

                {/* The actual Live Preview layout */}
                <div className="w-full flex-1 flex items-center justify-center py-4 px-2">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full h-full max-w-sm bg-white rounded-[28px] overflow-hidden flex flex-col shadow-xl border border-white/10 transition-colors duration-300"
                    style={{
                      backgroundColor: previewStyle.bg,
                      color: previewStyle.text,
                    }}
                  >
                    {/* Simulated Header */}
                    <div className="px-5 py-3.5 border-b border-opacity-10 border-current flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider ${previewStyle.font}`}
                          style={{ color: previewStyle.accent }}
                        >
                          {name.trim() || 'Mon Espace'}
                        </span>
                      </div>
                      <div className="flex gap-3.5 text-[8px] uppercase font-bold tracking-wider opacity-60">
                        <span>Accueil</span>
                        <span>Articles</span>
                      </div>
                    </div>

                    {/* Preview Body */}
                    <div className={`p-6 flex-1 flex flex-col justify-center ${previewStyle.font}`}>
                      <p
                        className="text-[7.5px] font-bold uppercase tracking-widest mb-1.5"
                        style={{ color: previewStyle.accent }}
                      >
                        {slug}.qoe.fi
                      </p>
                      <h1 className="text-2xl font-bold mb-4 leading-tight tracking-tight whitespace-pre-line">
                        {DEFAULT_HERO}
                      </h1>
                      <div className="flex items-center gap-3 mt-4">
                        <div
                          className="px-4 py-1.5 rounded text-white font-bold text-[8.5px] uppercase tracking-wider shadow-sm transition-all"
                          style={{ backgroundColor: previewStyle.accent }}
                        >
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
                        <div
                          key={i}
                          className="flex-1 bg-current opacity-[0.04] rounded-md h-16"
                        ></div>
                      ))}
                    </div>
                  </motion.div>
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
  );
}
