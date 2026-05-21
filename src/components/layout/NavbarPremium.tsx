"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslate } from "@tolgee/react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";

export const NavbarPremium = () => {
  const { t } = useTranslate();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center p-4 pointer-events-none select-none">
      <motion.header
        animate={{ y: isScrolled ? 4 : 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 28 }}
        className={cn(
          "w-full max-w-7xl pointer-events-auto transition-all duration-300 px-5 py-3 rounded-xl border flex items-center justify-between",
          isScrolled
            ? "bg-white/92 backdrop-blur-md border-neutral-200/80 shadow-sm"
            : "bg-transparent border-transparent"
        )}
        role="banner"
      >
        {/* Left: Logo */}
        <Link
          href="/"
          className="flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 rounded"
        >
          <Logo className="h-5 w-auto" />
        </Link>

        {/* Center: subtle search pill (hidden on mobile) */}
        <button
          className={cn(
            "hidden md:flex items-center gap-2 transition-all duration-300 rounded-lg px-3 py-1.5 text-xs",
            isScrolled
              ? "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 border border-neutral-200/60"
              : "text-neutral-400/70 hover:text-neutral-500"
          )}
          aria-label="Ouvrir la recherche"
        >
          <span>Rechercher</span>
          <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200/80 text-[9px] font-mono text-neutral-400 leading-none">
            ⌘K
          </kbd>
        </button>

        {/* Right: Connexion */}
        <Link
          href="/login"
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 rounded-lg px-3 py-2"
        >
          {t("nav_login", "Connexion")}
        </Link>
      </motion.header>
    </div>
  );
};
