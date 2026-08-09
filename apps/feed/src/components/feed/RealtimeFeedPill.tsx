"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";

export interface RealtimeFeedPillProps {
  unreadCount: number;
  onFlush: () => void;
}

export function RealtimeFeedPill({ unreadCount, onFlush }: RealtimeFeedPillProps) {
  if (unreadCount <= 0) return null;

  return (
    <AnimatePresence>
      <div className="sticky top-20 z-40 flex justify-center w-full pointer-events-none mb-4">
        <motion.button
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onFlush}
          className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-medium text-sm shadow-lg shadow-primary/25 border border-primary/20 cursor-pointer backdrop-blur-md transition-shadow hover:shadow-xl"
        >
          <ArrowUp className="w-4 h-4 animate-bounce" />
          <span>
            {unreadCount} {unreadCount === 1 ? "nouvelle pensée" : "nouvelles pensées"}
          </span>
        </motion.button>
      </div>
    </AnimatePresence>
  );
}
