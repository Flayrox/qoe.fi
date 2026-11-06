'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { BRAND_LOGOS } from '@qoe/brand';
import { Button } from './primitives/button/button';

export interface NotFoundViewProps {
  /**
   * Code de langue optionnel ('fr' ou 'en'). Si omis, auto-détecté via html lang ou 'fr'.
   */
  locale?: 'fr' | 'en';
  /**
   * Titre personnalisé optionnel (non affiché dans cette vue ultra-minimaliste).
   */
  title?: string;
  /**
   * Message personnalisé optionnel (non affiché dans cette vue ultra-minimaliste).
   */
  description?: string;
  /**
   * Afficher ou masquer la barre de recherche intégrée (conservé pour rétro-compatibilité).
   */
  showSearch?: boolean;
}

const STRINGS = {
  fr: {
    backHome: 'Retour à l’accueil',
  },
  en: {
    backHome: 'Back to home',
  },
};

export function NotFoundView({ locale: propLocale }: NotFoundViewProps) {
  const router = useRouter();
  const [locale, setLocale] = useState<'fr' | 'en'>(propLocale || 'fr');

  useEffect(() => {
    if (!propLocale && typeof document !== 'undefined') {
      const docLang = document.documentElement.lang?.toLowerCase();
      if (docLang?.startsWith('en')) {
        setLocale('en');
      }
    }
  }, [propLocale]);

  const t = STRINGS[locale];

  return (
    <main className="min-h-[82vh] flex flex-col items-center justify-center p-4 sm:p-6 select-none relative overflow-hidden">
      {/* Halo d'ambiance vermillon ultra-subtil et diffus */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[360px] rounded-full bg-[#EE4B2B]/[0.04] dark:bg-[#EE4B2B]/[0.08] blur-[120px]"
      />

      {/* Styles d'animation SVG intégrés & légers */}
      <style>{`
        @keyframes qoe404Float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes qoe404Trace {
          0% { stroke-dashoffset: 100; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes qoe404TraceDigit {
          0% { stroke-dashoffset: 200; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes qoe404Pulse {
          0%, 100% { opacity: 0.16; transform: scale(0.98); }
          50% { opacity: 0.40; transform: scale(1.03); }
        }
        @keyframes qoe404Guide {
          0%, 100% { opacity: 0.08; }
          50% { opacity: 0.22; }
        }
        .qoe-404-float {
          animation: qoe404Float 4.5s ease-in-out infinite;
        }
        .qoe-404-trace {
          stroke-dasharray: 25 75;
          animation: qoe404Trace 5s linear infinite;
        }
        .qoe-404-digit-trace {
          stroke-dasharray: 40 160;
          animation: qoe404TraceDigit 6s linear infinite;
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
          .qoe-404-digit-trace,
          .qoe-404-pulse,
          .qoe-404-guide {
            animation: none !important;
          }
        }
        :root[data-qoe-reduce-motion='true'] .qoe-404-float,
        :root[data-qoe-reduce-motion='true'] .qoe-404-trace,
        :root[data-qoe-reduce-motion='true'] .qoe-404-digit-trace,
        :root[data-qoe-reduce-motion='true'] .qoe-404-pulse,
        :root[data-qoe-reduce-motion='true'] .qoe-404-guide {
          animation: none !important;
        }
      `}</style>

      <div className="w-full max-w-md flex flex-col items-center text-center gap-8 relative z-10">
        {/* 🎨 Animation SVG construite en harmonie géométrique avec le logo Qoefi */}
        <div className="w-full max-w-xs sm:max-w-sm aspect-[520/200] relative">
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
              <linearGradient id="qoe-digit-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#EE4B2B" stopOpacity="0.8" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.25" />
              </linearGradient>
              <filter id="qoe-404-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="qoe-404-aura" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="16" />
              </filter>
            </defs>

            {/* Lignes de construction typographiques reliant les '4' au logo central */}
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
              {/* Ligne médiane traversante reliant le crossbar des 4 aux axes du logo */}
              <line x1="30" y1="117" x2="490" y2="117" strokeDasharray="1 7" />
            </g>

            {/* Chiffre 4 gauche — stylisé, géométrique et fluide */}
            <g transform="translate(56, 51)">
              {/* Tracé fantôme de fond */}
              <path
                d="M 52 2 L 6 66 H 72 M 52 2 V 96"
                fill="none"
                stroke="currentColor"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-20 dark:opacity-25"
              />
              {/* Filet d'accent lumineux vermillon qui parcourt le '4' */}
              <path
                d="M 52 2 L 6 66 H 72 M 52 2 V 96"
                fill="none"
                stroke="url(#qoe-digit-grad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={200}
                className="qoe-404-digit-trace opacity-75"
              />
              {/* Point de construction d'intersection (vertex) */}
              <circle cx="52" cy="66" r="2.5" fill="#EE4B2B" opacity="0.6" />
            </g>

            {/* Composition centrale du logo Qoefi */}
            <g className="qoe-404-float" style={{ transformOrigin: '260px 100px' }}>
              {/* Halo d'ambiance vermillon */}
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

              {/* Repères d'alignement et de cadrage architectural */}
              <g stroke="#EE4B2B" strokeWidth="1.5" strokeLinecap="square" opacity="0.55">
                <path d="M 172 59 V 45 H 186" fill="none" />
                <path d="M 334 45 H 348 V 59" fill="none" />
                <path d="M 172 141 V 155 H 186" fill="none" />
                <path d="M 334 155 H 348 V 141" fill="none" />
                <circle cx="260" cy="100" r="1.5" fill="#EE4B2B" opacity="0.5" />
              </g>

              {/* Glyphe officiel Qoefi & tracé lumineux animé */}
              <g transform="translate(180, 50.74) scale(0.74074)">
                <path
                  d={BRAND_LOGOS.symbol.path}
                  fill="url(#qoe-404-grad)"
                  filter="url(#qoe-404-glow)"
                />
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

            {/* Chiffre 4 droit — symétrique et stylisé */}
            <g transform="translate(392, 51)">
              {/* Tracé fantôme de fond */}
              <path
                d="M 52 2 L 6 66 H 72 M 52 2 V 96"
                fill="none"
                stroke="currentColor"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-20 dark:opacity-25"
              />
              {/* Filet d'accent lumineux vermillon qui parcourt le '4' */}
              <path
                d="M 52 2 L 6 66 H 72 M 52 2 V 96"
                fill="none"
                stroke="url(#qoe-digit-grad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={200}
                className="qoe-404-digit-trace opacity-75"
              />
              {/* Point de construction d'intersection (vertex) */}
              <circle cx="52" cy="66" r="2.5" fill="#EE4B2B" opacity="0.6" />
            </g>
          </svg>
        </div>

        {/* 🧭 Bouton minimaliste de retour à l'accueil du package UI */}
        <Button
          variant="outline"
          tone="neutral"
          size="sm"
          onClick={() => router.push('/home')}
          className="rounded-full px-4 text-xs font-medium text-muted-foreground hover:text-foreground border-border/80 hover:border-foreground/30 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5 opacity-70" />
          <span>{t.backHome}</span>
        </Button>
      </div>
    </main>
  );
}
