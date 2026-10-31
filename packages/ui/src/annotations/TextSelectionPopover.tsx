'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  useFloating,
  inline,
  flip,
  shift,
  offset,
  autoUpdate,
  hide,
  FloatingPortal,
} from '@floating-ui/react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import type { SelectionState, TextSelectionPopoverProps } from './types';

export type { SelectionState, TextSelectionPopoverProps };

export function TextSelectionPopover({
  containerId,
  minSelectionLength = 1,
  isLocked = false,
  isDismissed = false,
  onSelectionChange,
  children,
  className,
  ariaLabel = t`Annoter la sélection`,
}: TextSelectionPopoverProps & { ariaLabel?: string }) {
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionRange, setSelectionRange] = useState<Range | null>(null);
  // ⚠️ Une sélection à moins d'une hauteur de barre du haut laissait
  // `flip` placer la barre au-dessus de l'écran (mesuré : top −12 px) :
  // elle existait, on ne la voyait pas. On choisit le côté AVANT le rendu
  // plutôt que de compter sur le retournement.
  const [preferredPlacement, setPreferredPlacement] = useState<'top' | 'bottom'>('top');
  const [virtualElement, setVirtualElement] = useState<{
    getBoundingClientRect(): DOMRect;
    getClientRects(): DOMRectList;
    contextElement?: Element;
  } | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  // Une sélection faite au clavier n'a aucun moyen d'atteindre la barre :
  // elle est portée dans un portail, après la fin du document. On ne vole
  // donc le focus que dans ce cas (jamais après une sélection à la souris,
  // où il casserait le geste).
  const focusOnOpenRef = useRef(false);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { refs, floatingStyles, placement, middlewareData } = useFloating({
    open: Boolean(virtualElement),
    placement: preferredPlacement,
    strategy: 'fixed',
    middleware: [
      offset(12),
      inline(),
      flip({
        fallbackPlacements: ['bottom', 'top-start', 'top-end', 'bottom-start', 'bottom-end'],
        padding: 16,
      }),
      shift({ padding: 16 }),
      hide(),
    ],
    whileElementsMounted: autoUpdate,
  });

  const clearSelection = useCallback(() => {
    if (isLocked) return;
    setVirtualElement(null);
    setSelectedText('');
    setSelectionRange(null);
    onSelectionChange?.(null);
  }, [isLocked, onSelectionChange]);

  // ⚠️ `isLocked` n'était lu QUE pour ignorer de nouvelles sélections : la
  // barre déjà ouverte restait affichée. Ouvrir le tiroir laissait donc la
  // barre d'annotation posée au-dessus du voile, sur un passage devenu
  // inaccessible. `isDismissed` la referme, une fois par transition —
  // distinct de `isLocked`, qui gèle la sélection pendant la saisie d'une
  // note et doit laisser le formulaire ouvert.
  const wasDismissedRef = useRef(false);
  useEffect(() => {
    if (isDismissed && !wasDismissedRef.current) {
      setVirtualElement(null);
      setSelectedText('');
      setSelectionRange(null);
      onSelectionChange?.(null);
    }
    wasDismissedRef.current = isDismissed;
  }, [isDismissed, onSelectionChange]);

  const evaluateSelection = useCallback(() => {
    if (isLocked) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      clearSelection();
      return;
    }

    const text = selection.toString().trim();
    if (text.length < minSelectionLength) {
      clearSelection();
      return;
    }

    const range = selection.getRangeAt(0);
    let commonAncestor: Node | null = range.commonAncestorContainer;
    if (commonAncestor && commonAncestor.nodeType === Node.TEXT_NODE) {
      commonAncestor = commonAncestor.parentElement;
    }

    if (containerId) {
      const container = document.getElementById(containerId);
      if (!container || (commonAncestor && !container.contains(commonAncestor))) {
        clearSelection();
        return;
      }
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      clearSelection();
      return;
    }

    // La barre a besoin d'environ 56 px au-dessus ; sous 150 px, on l'ouvre
    // en dessous. Le calcul se fait sur la sélection, pas sur un rendu
    // précédent.
    setPreferredPlacement(rect.top < 150 ? 'bottom' : 'top');

    const contextEl =
      (commonAncestor as Element | null) ||
      (containerId ? document.getElementById(containerId) : null) ||
      document.body;

    const virtualRefObj = {
      getBoundingClientRect() {
        return range.getBoundingClientRect();
      },
      getClientRects() {
        return range.getClientRects();
      },
      contextElement: contextEl,
    };

    setVirtualElement(virtualRefObj);
    refs.setReference(virtualRefObj);
    setSelectedText(text);
    setSelectionRange(range);

    onSelectionChange?.({
      text,
      range,
      placement,
      clearSelection,
    });
  }, [
    containerId,
    minSelectionLength,
    isLocked,
    clearSelection,
    onSelectionChange,
    refs,
    placement,
  ]);

  // Track active scroll (in capture phase) to detect drawer, modal, and window scroll
  useEffect(() => {
    const handleScroll = () => {
      isScrollingRef.current = true;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 150);
    };

    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return;
      }
      requestAnimationFrame(evaluateSelection);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        focusOnOpenRef.current = true;
        requestAnimationFrame(evaluateSelection);
      }
    };

    const handleSelectionChange = () => {
      // Ignore during lock or while user is actively scrolling
      if (isLocked || isScrollingRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        requestAnimationFrame(evaluateSelection);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [evaluateSelection, isLocked]);

  // Le focus est posé après le rendu de la barre, une fois qu'elle existe.
  useEffect(() => {
    if (!selectedText || !focusOnOpenRef.current) return;
    focusOnOpenRef.current = false;
    popoverRef.current?.focus();
  }, [selectedText]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      clearSelection();
      // Rendre le focus au document plutôt qu'au néant : sans ça, le focus
      // reste sur un élément qui vient d'être démonté.
      (document.activeElement as HTMLElement | null)?.blur();
    }
  };

  // Masquage immédiat (l'effet ci-dessus nettoie l'état au même moment) :
  // aucun rendu intermédiaire ne laisse la barre par-dessus le tiroir.
  if (isDismissed || !virtualElement || !selectedText || !selectionRange) return null;

  const isHidden = Boolean(middlewareData.hide?.referenceHidden);

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{
          ...(floatingStyles as React.CSSProperties),
          opacity: isHidden ? 0 : 1,
          pointerEvents: isHidden ? 'none' : 'auto',
          transition: 'opacity 0.15s ease-out',
        }}
        role="toolbar"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        onKeyDown={handleKeyDown}
        className={cn(
          'z-50 pointer-events-auto select-none font-sans flex items-center justify-center',
          className
        )}
        onPointerDown={(e) => {
          if (isLocked) return;
          const target = e.target as HTMLElement;
          if (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT') {
            e.preventDefault();
          }
        }}
      >
        <div
          ref={popoverRef}
          tabIndex={-1}
          className="flex items-center justify-center outline-none"
        >
          <AnimatePresence>
            <motion.div
              key="apple-selection-popover"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={
                shouldReduceMotion ? { duration: 0 } : { duration: 0.12, ease: 'easeOut' }
              }
              className="relative"
            >
              {children({
                text: selectedText,
                range: selectionRange,
                placement,
                clearSelection,
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </FloatingPortal>
  );
}
