'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFloating, inline, flip, shift, offset, autoUpdate, hide } from '@floating-ui/react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@qoe/utils';
import type { SelectionState, TextSelectionPopoverProps } from './types';

export type { SelectionState, TextSelectionPopoverProps };

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
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { refs, floatingStyles, placement, middlewareData } = useFloating({
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

  // Track active scroll to prevent premature deselection from browser transient events
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

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
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

  if (!virtualElement || !selectedText || !selectionRange) return null;

  const isHidden = Boolean(middlewareData.hide?.referenceHidden);

  return (
    <div
      ref={refs.setFloating}
      style={{
        ...(floatingStyles as React.CSSProperties),
        opacity: isHidden ? 0 : 1,
        pointerEvents: isHidden ? 'none' : 'auto',
        transition: 'opacity 0.15s ease-out',
      }}
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
      onTouchStart={(e) => {
        if (isLocked) return;
        const target = e.target as HTMLElement;
        if (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT') {
          e.preventDefault();
        }
      }}
    >
      <div ref={popoverRef} className="flex items-center justify-center">
        <AnimatePresence>
          <motion.div
            key="apple-selection-popover"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.12, ease: 'easeOut' }}
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
