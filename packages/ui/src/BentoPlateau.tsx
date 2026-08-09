"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@qoe/utils";

interface BentoPlateauProps {
  children: React.ReactNode;
  className?: string;
}

export function BentoPlateau({ children, className }: BentoPlateauProps) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl bg-card/80 backdrop-blur-xl border border-border/40 flex flex-col md:flex-row overflow-hidden shadow-xs p-2 md:p-3 gap-2 md:gap-3",
        className
      )}
    >
      {children}
    </div>
  );
}

interface BentoItemProps {
  children: React.ReactNode;
  inactiveContent?: React.ReactNode;
  active: boolean;
  flexBasisActive?: string;
  flexBasisInactive?: string;
  onMouseEnter?: () => void;
  onClick?: () => void;
  className?: string;
  innerClassName?: string;
}

export function BentoItem({
  children,
  inactiveContent,
  active,
  flexBasisActive = "72%",
  flexBasisInactive = "28%",
  onMouseEnter,
  onClick,
  className,
  innerClassName,
}: BentoItemProps) {
  return (
    <motion.div
      layout
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{ flexBasis: active ? flexBasisActive : flexBasisInactive, flexShrink: 0, flexGrow: active ? 0 : 1 }}
      className={cn(
        "relative rounded-xl overflow-hidden cursor-pointer border border-border/30 transition-all duration-200",
        active ? "bg-muted/60" : "bg-muted/20 hover:bg-muted/40",
        className
      )}
    >
      {/* Active State */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          active ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className={cn("w-full h-full rounded-xl flex flex-col overflow-hidden text-foreground", innerClassName)}>
          {children}
        </div>
      </div>

      {/* Inactive State */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end p-6 md:p-8 transition-opacity duration-300 text-muted-foreground",
          active ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
      >
        {inactiveContent}
      </div>
    </motion.div>
  );
}
