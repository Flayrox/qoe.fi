'use client';

// =====================================================================
// ⚓ MinimalDock.tsx — Dock flottant contextuel Minimal Craft
// =====================================================================
// Fonctions intelligentes :
// 1. Mode Accueil / Sommaire :
//    - Pastille d'accentuation
//    - Bouton d'accès au Sommaire & Rubriques
//    - Bouton d'action direct « S'abonner » ou Soutien
// 2. Mode Article :
//    - Progression de lecture dynamique (% lu et temps restant)
//    - Bouton de retour au Sommaire
//    - Bouton « Partager » (copie du lien dans le presse-papiers avec feedback)
// =====================================================================

import React, { useState, useEffect } from 'react';
import { Share2, Check, ArrowLeft } from 'lucide-react';
import { cn } from '@qoe/utils';
import { SidebarToggleIcon } from '../../../ui/craft-sidebar-drawer';

export interface MinimalDockProps {
  mode?: 'home' | 'article';
  articleTitle?: string | null;
  itemsCount?: number;
  readingTimeMinutes?: number;
  indicatorColor?: string;
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  onSubscribeClick?: () => void;
  supportUrl?: string | null;
  className?: string;
}

export function MinimalDock({
  mode = 'home',
  itemsCount = 0,
  readingTimeMinutes = 4,
  indicatorColor = '#F97316',
  isDrawerOpen,
  onToggleDrawer,
  onSubscribeClick,
  supportUrl,
  className,
}: MinimalDockProps) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  // Suivi dynamique du pourcentage de lecture sur la page article
  useEffect(() => {
    if (mode !== 'article') return;

    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const progress = Math.min(
          100,
          Math.max(0, Math.round((window.scrollY / totalHeight) * 100))
        );
        setScrollProgress(progress);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [mode]);

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const remainingMinutes = Math.max(1, Math.round(readingTimeMinutes * (1 - scrollProgress / 100)));

  return (
    <div
      data-footer="true"
      className={cn(
        'footer_root fixed bottom-6 max-sm:bottom-4 left-1/2 -translate-x-1/2 z-30 select-none pointer-events-auto rounded-[20px] shadow-lg border border-border/50 bg-background/90 backdrop-blur-md px-3 py-1.5',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {mode === 'article' ? (
          /* ── DOCK CONTEXTUEL ARTICLE : CONFORT DE LECTURE & ACTIONS ── */
          <>
            {/* Bouton retour Accueil */}
            <a
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-muted text-foreground transition-all cursor-pointer text-xs group"
              title="Retour à l'accueil"
            >
              <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span className="font-medium hidden sm:inline">Accueil</span>
            </a>

            <div className="h-3 w-px bg-border/60" />

            {/* Bouton Sommaire */}
            <button
              type="button"
              onClick={onToggleDrawer}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer text-xs"
              title="Ouvrir le sommaire"
            >
              <SidebarToggleIcon isOpen={isDrawerOpen} size={13} />
              <span className="font-medium hidden sm:inline">Sommaire</span>
            </button>

            <div className="h-3 w-px bg-border/60" />

            {/* Progression dynamique de lecture */}
            <div className="flex items-center gap-2 px-2.5 py-1 text-xs text-muted-foreground">
              <span
                className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
                style={{ backgroundColor: indicatorColor }}
              />
              <span className="font-medium text-foreground">{scrollProgress}% lu</span>
              <span className="text-muted-foreground/40 hidden sm:inline">·</span>
              <span className="text-[11px] hidden sm:inline">
                {scrollProgress >= 95 ? 'Terminé' : `${remainingMinutes} min restantes`}
              </span>
            </div>

            <div className="h-3 w-px bg-border/60" />

            {/* Bouton Partager */}
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer text-xs"
              title="Copier le lien"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-success" />
                  <span className="text-[11px] font-medium text-success">Copié</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="text-[11px] hidden sm:inline">Partager</span>
                </>
              )}
            </button>
          </>
        ) : (
          /* ── DOCK CONTEXTUEL ACCUEIL : EXPLORATION & ABONNEMENT ── */
          <>
            {/* Bouton d'accès au Sommaire */}
            <button
              type="button"
              onClick={onToggleDrawer}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full hover:bg-muted text-foreground transition-all cursor-pointer text-xs group"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs transition-transform group-hover:scale-110"
                style={{ backgroundColor: indicatorColor }}
              />
              <span className="font-semibold tracking-tight">Index</span>
              {itemsCount > 0 && (
                <span className="text-[11px] text-muted-foreground">({itemsCount})</span>
              )}
              <SidebarToggleIcon isOpen={isDrawerOpen} size={13} />
            </button>

            {/* Séparateur */}
            <div className="h-3.5 w-px bg-border/60" />

            {/* Bouton S'abonner / Soutenir */}
            {supportUrl ? (
              <a
                href={supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 rounded-full text-xs font-semibold text-white shadow-2xs transition-transform active:scale-95"
                style={{ backgroundColor: indicatorColor }}
              >
                S'abonner
              </a>
            ) : onSubscribeClick ? (
              <button
                type="button"
                onClick={onSubscribeClick}
                className="px-3 py-1 rounded-full text-xs font-semibold text-white shadow-2xs transition-transform active:scale-95 cursor-pointer"
                style={{ backgroundColor: indicatorColor }}
              >
                S'abonner
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleDrawer}
                className="px-2.5 py-1 rounded-full hover:bg-muted text-[11px] text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              >
                Rubriques
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
