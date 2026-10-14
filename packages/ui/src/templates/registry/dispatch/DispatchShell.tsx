'use client';

// =====================================================================
// DispatchShell.tsx — Enveloppe souveraine du thème Dispatch
// =====================================================================
// Topbar épurée, barre d'onglets, bouton d'abonnement pill et footer unifié.
// =====================================================================

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';
import type { ThemeShellProps } from '../types';

export function DispatchShell({ publication, children, className = '', style }: ThemeShellProps) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const name = publication.name || 'Publication';
  const logo = publication.logoUrl;
  const categories = publication.categories || [];
  const navigation = publication.navigation || [];

  return (
    <div
      style={style}
      className={`min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-[var(--tenant-accent)] selection:text-white ${className}`}
    >
      {/* 1. TOPBAR PRINCIPALE */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Nom */}
          <Link href="/" className="flex items-center gap-3 group min-w-0">
            {logo ? (
              <img
                src={logo}
                alt={name}
                className="w-9 h-9 rounded-md object-cover border border-border/80 shadow-xs"
              />
            ) : (
              <div className="w-9 h-9 rounded-md bg-foreground text-background font-bold flex items-center justify-center text-sm shadow-xs">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-bold text-lg sm:text-xl tracking-tight text-foreground group-hover:text-primary transition-colors truncate">
              {name}
            </span>
          </Link>

          {/* Actions : Recherche + Bouton S'abonner Pill */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Rechercher"
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>

            <Link
              href="#subscribe"
              className="inline-flex items-center justify-center px-4 py-2 rounded-full text-xs sm:text-sm font-semibold bg-[var(--tenant-accent)] text-white shadow-xs hover:opacity-90 active:scale-95 transition-all"
            >
              S'abonner
            </Link>
          </div>
        </div>

        {/* 2. SUB-NAV TABS (Catégories / Sections) */}
        <div className="border-t border-border/40 bg-background/60 overflow-x-auto scrollbar-none">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 sm:gap-2 h-11 text-xs sm:text-sm font-medium">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                pathname === '/'
                  ? 'text-foreground font-semibold bg-muted/60'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              Accueil
            </Link>

            {categories.map((cat) => {
              const href = `/${cat.slug}`;
              const active = pathname === href;
              return (
                <Link
                  key={cat.id}
                  href={href}
                  className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'text-foreground font-semibold bg-muted/60'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  {cat.name}
                </Link>
              );
            })}

            {navigation.map((nav) => (
              <a
                key={nav.id}
                href={nav.url || '#'}
                target={nav.isExternal ? '_blank' : undefined}
                rel={nav.isExternal ? 'noopener noreferrer' : undefined}
                className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors whitespace-nowrap"
              >
                {nav.label}
              </a>
            ))}

            <Link
              href="/archive"
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                pathname === '/archive'
                  ? 'text-foreground font-semibold bg-muted/60'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              Archives
            </Link>

            <Link
              href="/about"
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                pathname === '/about'
                  ? 'text-foreground font-semibold bg-muted/60'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              À propos
            </Link>
          </div>
        </div>
      </header>

      {/* MODAL RECHERCHE RAPIDE */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start justify-center p-4 pt-20">
          <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg p-4 flex flex-col gap-4 animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center gap-2 flex-1">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Rechercher un article..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-sm focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-muted-foreground py-4 text-center">
              Tapez au moins 2 lettres pour explorer les publications.
            </div>
          </div>
        </div>
      )}

      {/* 3. CORPS DE LA PAGE */}
      <main className="flex-1 w-full">{children}</main>

      {/* 4. FOOTER UNIFIÉ */}
      <footer className="border-t border-border/60 bg-muted/20 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center text-center gap-4">
          <div className="flex items-center gap-2">
            {logo ? (
              <img src={logo} alt={name} className="w-6 h-6 rounded-sm object-cover" />
            ) : null}
            <span className="font-bold text-sm text-foreground">{name}</span>
          </div>

          <p className="text-xs text-muted-foreground max-w-md">
            {publication.footerText ||
              publication.heroText ||
              'Rejoignez les lecteurs fidèles pour recevoir les prochaines éditions directement.'}
          </p>

          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
            <Link href="/" className="hover:underline">
              Accueil
            </Link>
            <Link href="/archive" className="hover:underline">
              Archives
            </Link>
            <Link href="/about" className="hover:underline">
              À propos
            </Link>
            {publication.supportUrl && (
              <a
                href={publication.supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Contact
              </a>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground/60 pt-4">
            © {new Date().getFullYear()} {name}. Propulsé par Qoefi.
          </p>
        </div>
      </footer>
    </div>
  );
}
