// =====================================================================
// SidebarDrawer.tsx — Tiroir de navigation Studio avec <Sidebar />
// =====================================================================

'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Sidebar } from '@qoe/ui/sidebar';
import type { SidebarProps } from '@qoe/ui/sidebar';

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sidebarProps?: SidebarProps;
}

export function SidebarDrawer({ isOpen, onClose, sidebarProps }: SidebarDrawerProps) {
  // Fermeture par la touche Échap
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch">
      {/* ── Fond Assombri Dépoli (Backdrop) ── */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 transition-opacity duration-300"
      />

      {/* ── Tiroir Latéral Coulissant ── */}
      <div className="relative z-10 flex flex-col h-full bg-background border-r border-border shadow-lg animate-in slide-in-from-left duration-200">
        {/* Bouton Fermer Flottant */}
        <button
          type="button"
          onClick={onClose}
          title="Fermer le menu (Échap)"
          className="absolute top-3 right-3 z-30 flex items-center justify-center w-8 h-8 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Le VRAI composant <Sidebar /> de @qoe/ui/sidebar */}
        {sidebarProps ? (
          <Sidebar {...sidebarProps} />
        ) : (
          <div className="w-64 p-6 text-sm text-muted-foreground">
            Navigation Studio indisponible.
          </div>
        )}
      </div>
    </div>
  );
}
