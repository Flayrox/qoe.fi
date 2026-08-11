"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink } from "lucide-react";
import { ArticleAnnotatorView } from "./ArticleAnnotatorView";
import { routes } from "@qoe/config/routes";
import {
  TextHighlighter,
  AnnotationSideDrawer,
  TextSelectionPopover,
  type AnnotationItem,
  type AnnotationActionCallbacks,
} from "@qoe/ui/annotations";

export interface ArticleReaderDrawerProps {
  isOpen: boolean;
  article: any | null;
  onClose: () => void;
}

export function ArticleReaderDrawer({ isOpen, article, onClose }: ArticleReaderDrawerProps) {
  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!article) return null;

  const subdomain = article.author?.subdomain;
  const externalUrl = subdomain
    ? routes.tenant.article(subdomain, article.slug)
    : routes.feed.article(article.slug);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 md:left-64 z-50 flex flex-col justify-end pointer-events-auto select-text">
          {/* Backdrop Blur Overlay (Bounded right of sidebar) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 md:left-64 bg-black/40 backdrop-blur-xs cursor-pointer"
          />

          {/* Bottom Sheet Drawer Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="relative z-10 w-full h-[94vh] max-h-[94vh] flex flex-col bg-background text-foreground border-t border-l border-border/50 rounded-t-3xl shadow-2xl overflow-hidden font-sans"
          >
            {/* Top Drag Handle Bar */}
            <div className="w-full py-2.5 flex items-center justify-center shrink-0 bg-background cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
            </div>

            {/* Sticky Drawer Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border/40 shrink-0 bg-background/95 backdrop-blur-md z-20">
              <div className="flex items-center gap-3 min-w-0 pr-4">
                <span className="px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                  Lecture & Annotation
                </span>
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {article.title}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/60 transition-colors cursor-pointer"
                  title="Ouvrir dans une nouvelle page"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/60 transition-colors outline-none cursor-pointer"
                  title="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Scroll Container */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-6">
              <div className="max-w-6xl mx-auto">
                <ArticleAnnotatorView article={article} onClose={onClose} />
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
