"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslate } from "@tolgee/react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { getCurrentUser, logout } from "@/app/login/actions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Activity, BookMarked, Highlighter, Wallet, LogOut, LayoutDashboard, ShieldAlert } from "lucide-react";

export const NavbarPremium = () => {
  const { t } = useTranslate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHeroClosed, setIsHeroClosed] = useState(false);
  
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

    // Fetch user details
    getCurrentUser().then((data) => {
      setUser(data);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

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

        {/* Right: Connexion or User Profile */}
        {loading ? (
          <div className="h-8 w-8 bg-neutral-100 dark:bg-zinc-800 animate-pulse rounded-full" />
        ) : user ? (
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger className="focus:outline-none flex items-center cursor-pointer select-none">
                <Avatar className="h-8 w-8 rounded-full border border-[#EE4B2B]/20 hover:border-[#EE4B2B]/50 transition-colors">
                  <AvatarFallback className="bg-[#EE4B2B]/10 text-[#EE4B2B] text-xs font-bold font-sans">
                    {user.name ? user.name.slice(0, 2).toUpperCase() : user.email.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1 bg-white dark:bg-zinc-950 border border-neutral-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xl">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2.5 py-2">
                    <span className="font-bold text-sm block leading-tight text-foreground">{user.name || "Lecteur"}</span>
                    <span className="text-[10px] text-muted-foreground block truncate mt-0.5">{user.email}</span>
                    <span className="inline-block mt-2 text-[9px] uppercase tracking-wider font-bold bg-neutral-100 dark:bg-zinc-900 px-2 py-0.5 rounded text-[#EE4B2B]">
                      {user.role === 'superadmin' ? 'Superadmin' : user.role === 'creator' ? 'Créateur' : 'Lecteur'}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-neutral-100 dark:bg-zinc-900" />
                  <DropdownMenuItem className="cursor-pointer font-sans text-xs" onClick={() => window.location.href = "/home"}>
                    <Activity className="w-4 h-4 mr-2.5 text-neutral-400 group-hover/dropdown-menu-item:text-white" />
                    Votre Timeline
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer font-sans text-xs" onClick={() => window.location.href = "/library"}>
                    <BookMarked className="w-4 h-4 mr-2.5 text-neutral-400 group-hover/dropdown-menu-item:text-white" />
                    Votre Sanctuaire
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer font-sans text-xs" onClick={() => window.location.href = "/highlights"}>
                    <Highlighter className="w-4 h-4 mr-2.5 text-neutral-400 group-hover/dropdown-menu-item:text-white" />
                    Vos Surlignages
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer font-sans text-xs" onClick={() => window.location.href = "/billing"}>
                    <Wallet className="w-4 h-4 mr-2.5 text-neutral-400 group-hover/dropdown-menu-item:text-white" />
                    Portefeuille & Abos
                  </DropdownMenuItem>
                  
                  {(user.role === 'creator' || user.role === 'superadmin') && (
                    <>
                      <DropdownMenuSeparator className="bg-neutral-100 dark:bg-zinc-900" />
                      <DropdownMenuItem className="cursor-pointer font-sans text-xs" onClick={() => window.location.href = "/dashboard"}>
                        <LayoutDashboard className="w-4 h-4 mr-2.5 text-neutral-400 group-hover/dropdown-menu-item:text-white" />
                        Espace Créateur
                      </DropdownMenuItem>
                    </>
                  )}
                  
                  {user.role === 'superadmin' && (
                    <DropdownMenuItem className="cursor-pointer font-sans text-xs" onClick={() => window.location.href = "/admin"}>
                      <ShieldAlert className="w-4 h-4 mr-2.5 text-neutral-400 group-hover/dropdown-menu-item:text-white" />
                      Espace Superadmin
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator className="bg-neutral-100 dark:bg-zinc-900" />
                  <DropdownMenuItem className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive font-sans text-xs" onClick={async () => {
                    await logout();
                    window.location.href = "/";
                  }}>
                    <LogOut className="w-4 h-4 mr-2.5" />
                    Se déconnecter
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Link
            href="/login"
            className={cn("text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30 rounded-lg px-3 py-2",
              isWhiteMode ? "text-white hover:text-white/80" : "text-neutral-600 hover:text-neutral-900"
            )}
          >
            {t("nav_login", "Connexion")}
          </Link>
        )}
      </motion.header>
    </div>
  );
};

