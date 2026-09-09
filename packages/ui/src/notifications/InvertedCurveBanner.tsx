'use client';

// =====================================================================
// 👑 InvertedCurveBanner — Bandeau à courbure inversée "embrassant l'écran"
// =====================================================================
// Inspiré du design moderne ultra-haut de gamme (Hostinger / Dynamic Notch) :
// Les congés concaves supérieurs (fillets gauche/droite) raccordent
// parfaitement le bandeau au sommet du viewport (y=0) avec continuité C1.
// =====================================================================

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Info, AlertTriangle, AlertCircle, X, ArrowRight } from 'lucide-react';
import { cn } from '@qoe/utils';

export type AnnouncementType = 'promo' | 'info' | 'warning' | 'critical';

export interface InvertedCurveBannerProps {
  id?: string;
  message: string;
  type?: AnnouncementType;
  linkUrl?: string;
  linkText?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const TYPE_CONFIG: Record<
  AnnouncementType,
  {
    bgClass: string;
    filletFill: string;
    borderClass: string;
    textColor: string;
    icon: React.ComponentType<{ className?: string }>;
    iconClass: string;
    badgeLabel: string;
    badgeClass: string;
    btnClass: string;
  }
> = {
  promo: {
    // Style signature Hostinger : violet obscur galactique
    bgClass: 'bg-[#130F26]',
    filletFill: 'text-[#130F26]',
    borderClass: 'border-[#312257]',
    textColor: 'text-[#EDE9FE]',
    icon: Sparkles,
    iconClass: 'text-[#A78BFA]',
    badgeLabel: 'Nouveau',
    badgeClass: 'bg-[#2E1065] text-[#C4B5FD] border border-[#5B21B6]/50',
    btnClass:
      'bg-[#2C1F52] hover:bg-[#3D2B70] text-white border border-[#4C368A] hover:border-[#6D4CBF]',
  },
  info: {
    bgClass: 'bg-[#0B132B]',
    filletFill: 'text-[#0B132B]',
    borderClass: 'border-[#1C2541]',
    textColor: 'text-[#E2E8F0]',
    icon: Info,
    iconClass: 'text-[#38BDF8]',
    badgeLabel: 'Info',
    badgeClass: 'bg-[#0369A1]/30 text-[#7DD3FC] border border-[#0284C7]/40',
    btnClass:
      'bg-[#1E293B] hover:bg-[#334155] text-white border border-[#475569] hover:border-[#64748B]',
  },
  warning: {
    bgClass: 'bg-[#201505]',
    filletFill: 'text-[#201505]',
    borderClass: 'border-[#4D330A]',
    textColor: 'text-[#FEF3C7]',
    icon: AlertTriangle,
    iconClass: 'text-[#FBBF24]',
    badgeLabel: 'Alerte',
    badgeClass: 'bg-[#78350F]/40 text-[#FDE68A] border border-[#B45309]/50',
    btnClass:
      'bg-[#451A03] hover:bg-[#78350F] text-white border border-[#92400E] hover:border-[#B45309]',
  },
  critical: {
    bgClass: 'bg-[#240A0A]',
    filletFill: 'text-[#240A0A]',
    borderClass: 'border-[#521919]',
    textColor: 'text-[#FEE2E2]',
    icon: AlertCircle,
    iconClass: 'text-[#F87171]',
    badgeLabel: 'Urgent',
    badgeClass: 'bg-[#7F1D1D]/40 text-[#FECACA] border border-[#991B1B]/50',
    btnClass:
      'bg-[#450A0A] hover:bg-[#7F1D1D] text-white border border-[#991B1B] hover:border-[#DC2626]',
  },
};

export function InvertedCurveBanner({
  id,
  message,
  type = 'promo',
  linkUrl,
  linkText,
  dismissible = true,
  onDismiss,
  className,
}: InvertedCurveBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  const storageKey = id ? `qoe_dismissed_announcement_${id}` : null;

  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      const dismissed = localStorage.getItem(storageKey);
      if (dismissed === 'true') {
        setIsVisible(false);
      }
    }
  }, [storageKey]);

  const handleDismiss = () => {
    setIsVisible(false);
    if (storageKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, 'true');
      } catch {
        // Ignorer en mode navigation privée
      }
    }
    onDismiss?.();
  };

  if (!message || !isVisible) {
    return null;
  }

  const config = TYPE_CONFIG[type] || TYPE_CONFIG.promo;
  const IconComponent = config.icon;

  return (
    <AnimatePresence>
      {isVisible && (
        <aside
          aria-label="Annonce de la plateforme"
          className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none select-none px-4"
        >
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={cn('relative pointer-events-auto flex items-center', className)}
          >
            {/* 👑 Fillet concave gauche (courbe inversée raccordant à y=0) */}
            <svg
              className={cn(
                'absolute top-0 -left-[16px] w-[16px] h-[16px] pointer-events-none drop-shadow-sm',
                config.filletFill
              )}
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M0,0 H16 V16 Q16,0 0,0 Z" />
            </svg>

            {/* Corps de la bannière suspendue */}
            <div
              className={cn(
                'flex items-center gap-3 px-4 md:px-5 py-2 md:py-2.5 rounded-b-2xl border-b border-x shadow-2xl backdrop-blur-md',
                config.bgClass,
                config.borderClass,
                config.textColor
              )}
            >
              {/* Badge & Icône */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={cn(
                    'flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                    config.badgeClass
                  )}
                >
                  <IconComponent className={cn('w-3 h-3', config.iconClass)} />
                  {config.badgeLabel}
                </span>
              </div>

              {/* Texte du message */}
              <p className="text-xs md:text-sm font-medium tracking-tight truncate max-w-[260px] sm:max-w-[420px] md:max-w-[580px]">
                {message}
              </p>

              {/* Bouton d'action / lien optionnel */}
              {linkUrl && (
                <a
                  href={linkUrl}
                  className={cn(
                    'flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full transition-all duration-150 flex-shrink-0 cursor-pointer shadow-sm',
                    config.btnClass
                  )}
                >
                  <span>{linkText || 'Découvrir'}</span>
                  <ArrowRight className="w-3 h-3" />
                </a>
              )}

              {/* Bouton Fermer */}
              {dismissible && (
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors ml-1 cursor-pointer flex-shrink-0"
                  aria-label="Fermer l'annonce"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 👑 Fillet concave droit (courbe inversée raccordant à y=0) */}
            <svg
              className={cn(
                'absolute top-0 -right-[16px] w-[16px] h-[16px] pointer-events-none drop-shadow-sm',
                config.filletFill
              )}
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M16,0 H0 V16 Q0,0 16,0 Z" />
            </svg>
          </motion.div>
        </aside>
      )}
    </AnimatePresence>
  );
}
