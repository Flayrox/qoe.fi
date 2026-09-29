'use client';

import React from 'react';
import Link from 'next/link';
import { Sparkles, Crown, ArrowRight } from 'lucide-react';
import { useFlag } from '@qoe/flags';
import { routes } from '@qoe/config/routes';
import { InAppPlacement } from '../placements/InAppPlacement';

export interface DynamicBannerSlotProps {
  /** Identifiant sémantique du slot (ex: 'reader.billing.hero', 'reader.library.top') */
  slot: string;
  /** Contenu de repli personnalisé (optionnel) */
  fallback?: React.ReactNode;
  /** Classes CSS supplémentaires */
  className?: string;
}

/**
 * 🦄 DynamicBannerSlot — Slot d'in-app messaging dynamique sans serveur tiers (Licorne 2027).
 * - Tente de résoudre un placement actif sur mesure via le moteur in-app souverain.
 * - Repli automatique sur la bannière native Qoefi Plus si aucun placement dédié n'est programmé.
 * - Piloté en temps réel par les Feature Flags (table feature_flags / admin / flags.ts).
 */
export function DynamicBannerSlot({
  slot,
  fallback = null,
  className = '',
}: DynamicBannerSlotProps) {
  const isBannerVisible = useFlag('reader-plus-banner');

  if (!isBannerVisible) {
    return null;
  }

  const defaultHeroFallback = (
    <div
      data-slot={slot}
      className={`rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs transition-all ${className}`}
    >
      <div className="flex items-start sm:items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-foreground">Qoefi Plus pour lecteurs</h2>
            <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
              Offre découverte
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Écoute vocale TTS, packs hors-ligne, assistant IA de lecture, thèmes confort et
            bibliothèque EPUB illimitée.
          </p>
        </div>
      </div>
      <Link
        href={routes.feed.pricing()}
        className="inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground hover:opacity-90 transition-opacity py-2 px-4 rounded-xl text-xs font-semibold shadow-xs shrink-0 self-start sm:self-auto cursor-pointer"
      >
        <Crown className="w-3.5 h-3.5" />
        Découvrir les offres
        <ArrowRight className="w-3 h-3 ml-0.5 opacity-80" />
      </Link>
    </div>
  );

  return (
    <InAppPlacement slot={slot} fallback={fallback || defaultHeroFallback} className={className} />
  );
}
