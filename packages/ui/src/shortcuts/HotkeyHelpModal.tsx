'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

export interface HotkeyHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HotkeyHelpModal({ isOpen, onClose }: HotkeyHelpModalProps) {
  if (!isOpen) return null;

  const hotkeysList = [
    { key: 'n', description: 'Rédiger une nouvelle pensée (Nouveau post)' },
    { key: '/', description: 'Activer la barre de recherche' },
    { key: 'j', description: 'Naviguer vers le bas (Pensée suivante)' },
    { key: 'k', description: 'Naviguer vers le haut (Pensée précédente)' },
    { key: 'l', description: 'Liker / Déliker la pensée active' },
    { key: 'r', description: 'Répondre à la pensée active' },
    { key: 'e', description: 'Ouvrir le thread complet de la pensée' },
    { key: '?', description: "Ouvrir cette modale d'aide des raccourcis" },
    { key: 'Échap', description: 'Fermer les modales et réinitialiser la sélection' },
  ];

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md font-sans"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-md bg-card text-card-foreground border border-border/50 rounded-2xl p-6 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-border/40 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Keyboard className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold tracking-tight text-foreground">
                Raccourcis Clavier
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Hotkeys List */}
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {hotkeysList.map((hk) => (
              <div
                key={hk.key}
                className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <span className="text-xs text-muted-foreground font-normal">{hk.description}</span>
                <kbd className="px-2.5 py-1 text-xs font-semibold text-foreground bg-background border border-border rounded-md shadow-xs min-w-[28px] text-center">
                  {hk.key}
                </kbd>
              </div>
            ))}
          </div>

          {/* Footer Note */}
          <div className="pt-4 mt-4 border-t border-border/40 text-center text-[11px] text-muted-foreground">
            Appuyez sur{' '}
            <kbd className="px-1.5 py-0.5 border border-border rounded bg-background font-mono text-[10px]">
              ?
            </kbd>{' '}
            à tout moment pour afficher cette aide.
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
