'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFloating, inline, flip, shift, offset, autoUpdate } from '@floating-ui/react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@qoe/utils';

export interface SelectionState {
  text: string;
  range: Range;
  placement: string;
  clearSelection: () => void;
}

export interface TextSelectionPopoverProps {
  /** ID de l'élément HTML conteneur (ex: "article-content"). Si omis, s'applique à tout le body. */
  containerId?: string;
  /** Longueur minimale de la chaîne sélectionnée pour afficher le popover (défaut : 1) */
  minSelectionLength?: number;
  /** Verrouille le popover et la sélection active (ex: pendant la saisie d'un formulaire) */
  isLocked?: boolean;
  /** Callback déclenchée quand la sélection change */
  onSelectionChange?: (selection: SelectionState | null) => void;
  /** Rendu des actions du popover */
  children: (selection: SelectionState) => React.ReactNode;
  /** Classe CSS additionnelle pour le conteneur du popover */
  className?: string;
}

export function TextSelectionPopover({
  containerId,
  minSelectionLength = 1,
  isLocked = false,
  onSelectionChange,
  children,
  className,
}: TextSelectionPopoverProps) {
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionRange, setSelectionRange] = useState<Range | null>(null);
  const [virtualElement, setVirtualElement] = useState<{
    getBoundingClientRect(): DOMRect;
    getClientRects(): DOMRectList;
  } | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const { refs, floatingStyles, placement } = useFloating({
    open: Boolean(virtualElement),
    placement: 'top',
    middleware: [
      offset(12),
      inline(),
      flip({
        fallbackPlacements: ['bottom', 'top-start', 'top-end', 'bottom-start', 'bottom-end'],
        padding: 16,
      }),
      shift({ padding: 16 }),
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

    const virtualRefObj = {
      getBoundingClientRect() {
        return range.getBoundingClientRect();
      },
      getClientRects() {
        return range.getClientRects();
      },
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

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return;
      }
      requestAnimationFrame(evaluateSelection);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        requestAnimationFrame(evaluateSelection);
      }
    };

    const handleSelectionChange = () => {
      if (isLocked) return;
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

  if (!virtualElement || !selectedText || !selectionRange) return null;

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles as React.CSSProperties}
      className={cn(
        'z-50 pointer-events-auto select-none font-sans flex items-center justify-center',
        className
      )}
      onMouseDown={(e) => {
        if (isLocked) return;
        const target = e.target as HTMLElement;
        if (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT') {
          e.preventDefault();
        }
      }}
    >
      <div ref={popoverRef} className="flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={placement}
            initial={{ scale: 0.92, opacity: 0, filter: 'blur(4px)' }}
            animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
            exit={{ scale: 0.92, opacity: 0, filter: 'blur(4px)' }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 500, damping: 32, mass: 0.6 }
            }
            style={{
              originX: 0.5,
              originY: placement.startsWith('top') ? 1 : 0,
            }}
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
  );
}
