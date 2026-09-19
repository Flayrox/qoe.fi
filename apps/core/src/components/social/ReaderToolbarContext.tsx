'use client';

import React, { createContext, useContext, useState, useRef } from 'react';
import type { AnnotationFilterMode } from '@qoe/ui/annotations';

export interface ReaderToolbarContextType {
  isDocked: boolean;
  setIsDocked: (docked: boolean) => void;
  bookmarked: boolean;
  setBookmarked: React.Dispatch<React.SetStateAction<boolean>>;
  toggleBookmark: () => void;
  registerToggleBookmark: (handler: () => void | Promise<void>) => void;
  copied: boolean;
  handleShare: () => void;
  filterMode: AnnotationFilterMode;
  setFilterMode: (mode: AnnotationFilterMode) => void;
  allowPublicAnnotations: boolean;
  setAllowPublicAnnotations: (allow: boolean) => void;
  authorToolbarRef: React.RefObject<HTMLDivElement | null>;
}

const ReaderToolbarContext = createContext<ReaderToolbarContextType | null>(null);

export function ReaderToolbarProvider({
  children,
  initialBookmarked = false,
  onToggleBookmark,
  onShare,
  allowPublicAnnotations = true,
}: {
  children: React.ReactNode;
  initialBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onShare?: () => void;
  allowPublicAnnotations?: boolean;
}) {
  const [isDocked, setIsDocked] = useState(false);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [copied, setCopied] = useState(false);
  const [filterMode, setFilterMode] = useState<AnnotationFilterMode>('all');
  const [allowPublic, setAllowPublicAnnotations] = useState(allowPublicAnnotations);
  const authorToolbarRef = useRef<HTMLDivElement | null>(null);
  const customToggleBookmarkRef = useRef<(() => void | Promise<void>) | null>(null);

  const registerToggleBookmark = (handler: () => void | Promise<void>) => {
    customToggleBookmarkRef.current = handler;
  };

  const toggleBookmark = () => {
    if (customToggleBookmarkRef.current) {
      customToggleBookmarkRef.current();
    } else {
      setBookmarked((prev) => !prev);
      onToggleBookmark?.();
    }
  };

  const handleShare = () => {
    if (onShare) {
      onShare();
    } else if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <ReaderToolbarContext.Provider
      value={{
        isDocked,
        setIsDocked,
        bookmarked,
        setBookmarked,
        toggleBookmark,
        registerToggleBookmark,
        copied,
        handleShare,
        filterMode,
        setFilterMode,
        allowPublicAnnotations: allowPublic,
        setAllowPublicAnnotations,
        authorToolbarRef,
      }}
    >
      {children}
    </ReaderToolbarContext.Provider>
  );
}

export function useReaderToolbar() {
  const context = useContext(ReaderToolbarContext);
  return context;
}
