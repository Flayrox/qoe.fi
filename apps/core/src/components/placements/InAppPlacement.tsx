'use client';

// =====================================================================
// 🦄 InAppPlacement — Composant Universel In-App Placements (Licorne 2027)
// =====================================================================
// - Résout le placement souverain pour un slot donné (zéro dépendance externe).
// - Acquittement synchronisé compte (DB) + optimiste (localStorage).
// - Multi-formats : 'notch_banner' (courbure inversée C1), 'card', 'callout'.
// - Zéro CLS grâce au support SSR de l'initialPlacement.
// =====================================================================

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Info, AlertTriangle, AlertCircle, X, ArrowRight, Crown } from 'lucide-react';
import { InvertedCurveBanner } from '@qoe/ui';
import { useFlag } from '@qoe/flags';
import { dismissPlacementAction, type InAppPlacementDTO } from '@/app/actions/placements';

export interface InAppPlacementProps {
  slot: string;
  initialPlacement?: InAppPlacementDTO | null;
  fallback?: React.ReactNode;
  className?: string;
}

const TYPE_STYLES = {
  promo: {
    bg: 'border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent',
    iconBg: 'bg-primary/10 text-primary',
    badge: 'bg-primary/10 text-primary border-primary/20',
    btn: 'bg-primary text-primary-foreground hover:opacity-90',
    icon: Sparkles,
  },
  info: {
    bg: 'border-border/60 bg-gradient-to-r from-muted/30 via-muted/10 to-transparent',
    iconBg: 'bg-primary/10 text-primary',
    badge: 'bg-primary/10 text-primary border-primary/20',
    btn: 'bg-foreground text-background hover:opacity-90',
    icon: Info,
  },
  warning: {
    bg: 'border-highlight/30 bg-gradient-to-r from-highlight/15 via-highlight/5 to-transparent',
    iconBg: 'bg-highlight/15 text-highlight',
    badge: 'bg-highlight/10 text-highlight border-highlight/30',
    btn: 'bg-foreground text-background hover:opacity-90',
    icon: AlertTriangle,
  },
  critical: {
    bg: 'border-destructive/30 bg-gradient-to-r from-destructive/15 via-destructive/5 to-transparent',
    iconBg: 'bg-destructive/15 text-destructive',
    badge: 'bg-destructive/10 text-destructive border-destructive/30',
    btn: 'bg-destructive text-destructive-foreground hover:opacity-90',
    icon: AlertCircle,
  },
};

export function InAppPlacement({
  slot,
  initialPlacement = null,
  fallback = null,
  className = '',
}: InAppPlacementProps) {
  const [placement] = useState<InAppPlacementDTO | null>(initialPlacement);
  const [isDismissed, setIsDismissed] = useState(false);
  const isPlusBannerAllowed = useFlag('reader-plus-banner');

  // Si c'est un placement promo ciblant Plus et que le flag de bannière est éteint, on masque
  const isBlockedByFlag =
    placement?.type === 'promo' && placement?.ctaUrl?.includes('/pricing') && !isPlusBannerAllowed;

  useEffect(() => {
    if (placement?.id && typeof window !== 'undefined') {
      const storageKey = `qoe_placement_dismissed_${placement.id}`;
      if (localStorage.getItem(storageKey) === 'true') {
        setIsDismissed(true);
      }
    }
  }, [placement?.id]);

  const handleDismiss = () => {
    if (!placement) return;
    setIsDismissed(true);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`qoe_placement_dismissed_${placement.id}`, 'true');
      } catch {
        // Ignorer en navigation privée
      }
    }

    // Synchronisation serveur asynchrone (pour mémoriser sur le compte)
    dismissPlacementAction(placement.id).catch((e) =>
      console.warn('[placements] dismiss sync warning:', e)
    );
  };

  if (!placement || isDismissed || isBlockedByFlag) {
    return fallback ? <>{fallback}</> : null;
  }

  // Format 1 : Bandeau notch haut d'écran à courbure inversée
  if (placement.format === 'notch_banner') {
    return (
      <InvertedCurveBanner
        id={placement.id}
        message={placement.body}
        type={placement.type}
        linkUrl={placement.ctaUrl}
        linkText={placement.ctaLabel}
        dismissible={placement.dismissible}
        onDismiss={handleDismiss}
        className={className}
      />
    );
  }

  // Format 2 : Carte in-page avec badge, dégradé & CTA (ex: Facturation, Accueil, Bibliothèque)
  const style = TYPE_STYLES[placement.type] || TYPE_STYLES.promo;
  const IconComponent = style.icon;

  return (
    <AnimatePresence>
      {!isDismissed && (
        <motion.aside
          data-placement-id={placement.id}
          data-slot={slot}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className={`relative rounded-2xl border ${style.bg} p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs transition-all ${className}`}
        >
          {placement.dismissible && (
            <button
              type="button"
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
              aria-label="Fermer cette notification"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-start sm:items-center gap-3.5 pr-6 sm:pr-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.iconBg}`}
            >
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">{placement.title}</h2>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.badge}`}
                >
                  {placement.type.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">{placement.body}</p>
            </div>
          </div>

          {placement.ctaUrl && placement.ctaLabel && (
            <Link
              href={placement.ctaUrl}
              className={`inline-flex items-center justify-center gap-1.5 transition-all py-2 px-4 rounded-xl text-xs font-semibold shadow-xs shrink-0 self-start sm:self-auto cursor-pointer ${style.btn}`}
            >
              {placement.type === 'promo' && <Crown className="w-3.5 h-3.5" />}
              {placement.ctaLabel}
              <ArrowRight className="w-3 h-3 ml-0.5 opacity-80" />
            </Link>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
