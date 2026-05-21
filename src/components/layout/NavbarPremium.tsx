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
  const [isHeroClosed, setIsHeroClosed] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll(); // Initialisation au chargement (si déjà scrollé)
    window.addEventListener("scroll", handleScroll, { passive: true });

    // Observer pour détecter quand la section Hero se ferme et devient orange au sommet
    const observer = new MutationObserver(() => {
      setIsHeroClosed(document.body.classList.contains("hero-closed"));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    setIsHeroClosed(document.body.classList.contains("hero-closed"));

    return () => {
      window.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, []);

  // Si on est tout en haut ET que le Hero est fermé (donc qu'on voit le bloc Orange de FeaturedPublications)
  const isWhiteMode = !isScrolled && isHeroClosed;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none select-none">
      <motion.header
        className={cn(
          "w-full max-w-7xl pointer-events-auto transition-all duration-300 px-5 py-3 rounded-b-xl border-b flex items-center justify-between",
          isScrolled
            ? "bg-white/92 backdrop-blur-md border-neutral-200/80 shadow-sm"
            : "bg-transparent border-transparent shadow-none"
        )}
        role="banner"
      >
        {/* Left: Logo — click to reset to top */}
        <Link
          href="/"
          data-logo
          onClick={(e) => { e.preventDefault(); window.location.href = "/"; }}
          className="flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 rounded"
        >
          <Logo className="h-5 w-auto transition-colors duration-300" fillColor={isWhiteMode ? "#FFFFFF" : "#EE4B2B"} />
        </Link>

        {/* Center: subtle search pill (hidden on mobile) */}
        <button
          className={cn(
            "hidden md:flex items-center gap-2 transition-all duration-300 rounded-lg px-3 py-1.5 text-xs",
            isWhiteMode
              ? "text-white/80 hover:text-white"
              : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 border border-transparent hover:border-neutral-200/60"
          )}
          aria-label={t("navbar.search", "Rechercher")}
        >
          <span>{t("navbar.search", "Rechercher")}</span>
          <kbd className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-mono leading-none transition-colors duration-300",
            isWhiteMode ? "bg-white/20 border-white/30 text-white" : "bg-neutral-100 border-neutral-200/80 text-neutral-400"
          )}>
            {t("navbar.search_shortcut", "⌘K")}
          </kbd>
        </button>

        {/* Right: Connexion */}
        <Link
          href="/login"
          className={cn("text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 rounded-lg px-3 py-2",
            isWhiteMode ? "text-white hover:text-white/80" : "text-neutral-600 hover:text-neutral-900"
          )}
        >
          {t("nav_login", "Connexion")}
        </Link>
      </motion.header>
    </div>
  );
};
