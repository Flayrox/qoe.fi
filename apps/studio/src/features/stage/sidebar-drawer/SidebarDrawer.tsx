// =====================================================================
// SidebarDrawer.tsx — Tiroir de navigation Studio avec <Sidebar />
// =====================================================================
// Tiroir **modal** : il recouvre tout l'écran, donc il doit se comporter comme
// un dialogue — rôle nommé, `aria-modal`, focus transféré à l'ouverture,
// restitué au déclencheur à la fermeture, tabulation piégée à l'intérieur.
// =====================================================================

'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Sidebar } from '@qoe/ui/sidebar';
import type { SidebarProps } from '@qoe/ui/sidebar';
import { t } from '@lingui/core/macro';

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sidebarProps?: SidebarProps;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SidebarDrawer({ isOpen, onClose, sidebarProps }: SidebarDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Le déclencheur reprend le focus quand le tiroir se referme.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      opener?.focus();
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback(() => onClose(), [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch">
      {/* ── Fond Assombri Dépoli (Backdrop) ── */}
      <div
        onClick={handleBackdropClick}
        aria-hidden="true"
        className="fixed inset-0 bg-black/50 transition-opacity duration-300"
      />

      {/* ── Tiroir Latéral Coulissant ── */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t`Navigation Studio`}
        className="relative z-10 flex flex-col h-full bg-background border-r border-border shadow-lg animate-in slide-in-from-left duration-200"
      >
        {/* Bouton Fermer Flottant */}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t`Fermer le menu`}
          title={t`Fermer le menu (Échap)`}
          className="absolute top-3 right-3 z-30 flex items-center justify-center w-8 h-8 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>

        {/* Le VRAI composant <Sidebar /> de @qoe/ui/sidebar */}
        {sidebarProps ? (
          <Sidebar {...sidebarProps} />
        ) : (
          <div className="w-64 p-6 text-sm text-muted-foreground">
            {t`Navigation Studio indisponible.`}
          </div>
        )}
      </div>
    </div>
  );
}
