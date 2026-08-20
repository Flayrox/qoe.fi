'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { OnboardingFlow, type OnboardingFlowProps } from './OnboardingFlow';

export interface OnboardingModalProps extends OnboardingFlowProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** false (défaut) = onboarding obligatoire : pas de fermeture tant qu'il n'est pas terminé. */
  dismissible?: boolean;
}

const springs = {
  overlay: { duration: 0.25, ease: 'easeOut' as const },
  modal: { type: 'spring' as const, stiffness: 380, damping: 28 },
};

export function OnboardingModal({
  open,
  onOpenChange,
  dismissible = false,
  categories,
  suggestedCreators,
  onSubmit,
}: OnboardingModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = () => {
    if (dismissible) {
      onOpenChange?.(false);
    }
  };

  const modalContent = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 md:p-6 overflow-y-auto pointer-events-auto">
          {/* Glass blur Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springs.overlay}
            className="fixed inset-0 bg-foreground/60 backdrop-blur-[12px]"
            onClick={handleClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 15 }}
            animate={{ opacity: 1, scale: 0.95, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 15 }}
            transition={springs.modal}
            className="relative z-10 w-full max-w-5xl mx-auto my-auto origin-center"
          >
            {/* Floating Close Button if dismissible */}
            {dismissible && (
              <button
                onClick={handleClose}
                className="absolute -top-3 -right-3 z-50 p-2.5 rounded-full bg-card text-card-foreground border border-border shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <OnboardingFlow
              categories={categories}
              suggestedCreators={suggestedCreators}
              onSubmit={onSubmit}
              onDone={() => {
                onOpenChange?.(false);
                router.refresh();
              }}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(modalContent, document.body);
}
