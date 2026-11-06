'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowLeft, Home } from 'lucide-react';
import { BRAND_LOGOS } from '@qoe/brand';

export interface NotFoundViewProps {
  /**
   * Code de langue optionnel ('fr' ou 'en'). Si omis, auto-détecté via html lang ou 'fr'.
   */
  locale?: 'fr' | 'en';
  /**
   * Titre personnalisé optionnel.
   */
  title?: string;
  /**
   * Message personnalisé optionnel.
   */
  description?: string;
  /**
   * Afficher ou masquer la barre de recherche intégrée (défaut: true).
   */
  showSearch?: boolean;
}

const STRINGS = {
  fr: {
    badge: 'ERREUR 404',
    title: 'Page introuvable',
    subtitle: 'La page que vous cherchez n’existe pas ou a été déplacée.',
    lostCoordinates: 'Chemin demandé : ',
    searchPlaceholder: 'Rechercher sur qoefi...',
    searchBtn: 'Rechercher',
    backHome: 'Retour à l’accueil',
    goBack: 'Page précédente',
  },
  en: {
    badge: 'ERROR 404',
    title: 'Page not found',
    subtitle: 'The page you are looking for does not exist or has been moved.',
    lostCoordinates: 'Requested path: ',
    searchPlaceholder: 'Search on qoefi...',
    searchBtn: 'Search',
    backHome: 'Back to home',
    goBack: 'Go back',
  },
};

export function NotFoundView({
  locale: propLocale,
  title,
  description,
  showSearch = true,
}: NotFoundViewProps) {
  const router = useRouter();
  const [locale, setLocale] = useState<'fr' | 'en'>(propLocale || 'fr');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPath, setCurrentPath] = useState('');

  useEffect(() => {
    if (!propLocale && typeof document !== 'undefined') {
      const docLang = document.documentElement.lang?.toLowerCase();
      if (docLang?.startsWith('en')) {
        setLocale('en');
      }
    }
    if (typeof window !== 'undefined') {
      setCurrentPath(window.location.pathname);
    }
  }, [propLocale]);

  const t = STRINGS[locale];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/home');
    }
  };

  return (
    <main className="min-h-[80vh] flex flex-col items-center justify-center p-4 sm:p-6 lg:p-10 select-none relative overflow-hidden">
      {/* Halo d'ambiance vermillon très subtil et diffus */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[360px] rounded-full bg-[#EE4B2B]/[0.04] dark:bg-[#EE4B2B]/[0.08] blur-[120px]"
      />

      {/* Styles d'animation SVG intégrés & auto-suffisants */}
      <style>{`
        @keyframes qoe404Float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes qoe404Trace {
          0% { stroke-dashoffset: 100; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes qoe404Pulse {
          0%, 100% { opacity: 0.18; transform: scale(0.98); }
          50% { opacity: 0.42; transform: scale(1.03); }
        }
        @keyframes qoe404Guide {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.28; }
        }
        .qoe-404-float {
          animation: qoe404Float 4.5s ease-in-out infinite;
        }
        .qoe-404-trace {
          stroke-dasharray: 25 75;
          animation: qoe404Trace 5s linear infinite;
        }
        .qoe-404-pulse {
          animation: qoe404Pulse 3.5s ease-in-out infinite;
        }
        .qoe-404-guide {
          animation: qoe404Guide 4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .qoe-404-float,
          .qoe-404-trace,
          .qoe-404-pulse,
          .qoe-404-guide {
            animation: none !important;
          }
        }
        :root[data-qoe-reduce-motion='true'] .qoe-404-float,
        :root[data-qoe-reduce-motion='true'] .qoe-404-trace,
        :root[data-qoe-reduce-motion='true'] .qoe-404-pulse,
        :root[data-qoe-reduce-motion='true'] .qoe-404-guide {
          animation: none !important;
        }
      `}</style>

      <div className="w-full max-w-xl flex flex-col items-center text-center gap-6 sm:gap-8 relative z-10">
        {/* 🎨 Animation SVG construite avec le logo Qoefi */}
        <div className="w-full max-w-sm sm:max-w-md aspect-[520/200] relative">
          <svg
            viewBox="0 0 520 200"
            className="w-full h-full overflow-visible text-foreground"
            role="img"
            aria-label="404 — Page introuvable"
          >
            <defs>
              <linearGradient id="qoe-404-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#EE4B2B" />
                <stop offset="100%" stopColor="#FF5A36" />
              </linearGradient>
              <linearGradient id="qoe-404-stroke-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                <stop offset="50%" stopColor="#EE4B2B" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.95" />
              </linearGradient>
              <filter id="qoe-404-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="qoe-404-aura" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="16" />
              </filter>
            </defs>

            {/* Lignes de construction typographiques (repères sobres) */}
            <g
              className="qoe-404-guide"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 5"
            >
              {/* Ligne de tête (cap-height) */}
              <line x1="30" y1="51" x2="490" y2="51" />
              {/* Ligne de base (baseline) */}
              <line x1="30" y1="149" x2="490" y2="149" />
              {/* Ligne médiane des traverses */}
              <line x1="30" y1="117" x2="490" y2="117" strokeDasharray="1 7" />
            </g>

            {/* Chiffre 4 gauche */}
            <g
              transform="translate(56, 51)"
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="opacity-25 dark:opacity-30 transition-opacity"
            >
              <path d="M 46 2 L 4 66 H 64 M 46 2 V 96" />
            </g>

            {/* Composition centrale du logo Qoefi */}
            <g className="qoe-404-float" style={{ transformOrigin: '260px 100px' }}>
              {/* Aura lumineuse vermillon */}
              <g className="qoe-404-pulse" style={{ transformOrigin: '260px 100px' }}>
                <rect
                  x="182"
                  y="53"
                  width="156"
                  height="94"
                  rx="28"
                  fill="#EE4B2B"
                  filter="url(#qoe-404-aura)"
                />
              </g>

              {/* Repères d'alignement et de cadrage aux 4 coins */}
              <g stroke="#EE4B2B" strokeWidth="1.5" strokeLinecap="square" opacity="0.6">
                <path d="M 172 59 V 45 H 186" fill="none" />
                <path d="M 334 45 H 348 V 59" fill="none" />
                <path d="M 172 141 V 155 H 186" fill="none" />
                <path d="M 334 155 H 348 V 141" fill="none" />
                <circle cx="260" cy="100" r="1.5" fill="#EE4B2B" opacity="0.5" />
              </g>

              {/* Glyphe officiel Qoefi & tracé lumineux animé */}
              <g transform="translate(180, 50.74) scale(0.74074)">
                {/* Remplissage vermillon officiel avec léger dégradé */}
                <path
                  d={BRAND_LOGOS.symbol.path}
                  fill="url(#qoe-404-grad)"
                  filter="url(#qoe-404-glow)"
                />
                {/* Filet lumineux vectoriel traçant le périmètre et la découpe */}
                <path
                  d={BRAND_LOGOS.symbol.path}
                  fill="none"
                  stroke="url(#qoe-404-stroke-grad)"
                  strokeWidth="2.5"
                  pathLength={100}
                  className="qoe-404-trace"
                />
              </g>
            </g>

            {/* Chiffre 4 droit */}
            <g
              transform="translate(396, 51)"
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="opacity-25 dark:opacity-30 transition-opacity"
            >
              <path d="M 46 2 L 4 66 H 64 M 46 2 V 96" />
            </g>
          </svg>
        </div>

        {/* 🏷️ Badge sobre */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60 text-muted-foreground border border-border/70 text-xs font-mono font-medium tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-[#EE4B2B] animate-pulse" />
          <span>{t.badge}</span>
        </div>

        {/* ✍️ Titre & Description sobre */}
        <div className="space-y-2.5">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            {title || t.title}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
            {description || t.subtitle}
          </p>
        </div>

        {/* 📍 Coordonnées demandées (si présentes) */}
        {currentPath && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-muted/40 text-muted-foreground text-xs font-mono border border-border/50 max-w-sm sm:max-w-md truncate">
            <span className="opacity-60">{t.lostCoordinates}</span>
            <span className="font-medium text-foreground/85 truncate">{currentPath}</span>
          </div>
        )}

        {/* 🔍 Barre de recherche discrète et élégante */}
        {showSearch && (
          <form
            onSubmit={handleSearchSubmit}
            className="w-full max-w-md relative flex items-center shadow-xs"
          >
            <Search className="absolute left-3.5 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-10 pr-24 py-2.5 rounded-xl border border-border/80 bg-card text-sm text-foreground placeholder:text-muted-foreground/60 transition-all outline-none focus:border-[#EE4B2B] focus:ring-2 focus:ring-[#EE4B2B]/20"
            />
            <button
              type="submit"
              className="absolute right-1.5 px-3.5 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 text-xs font-medium transition-opacity cursor-pointer"
            >
              {t.searchBtn}
            </button>
          </form>
        )}

        {/* 🧭 Actions & Navigation de Rebond */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#EE4B2B] hover:bg-[#d63f20] text-white text-sm font-medium shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>{t.backHome}</span>
          </button>

          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/80 bg-card hover:bg-muted/60 text-foreground text-sm font-medium transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.goBack}</span>
          </button>
        </div>
      </div>
    </main>
  );
}
