'use client';

// =====================================================================
// DispatchAuthorSidebar.tsx — Sidebar d'Auteur / Publication
// =====================================================================
// Découplé, sticky sur desktop, autonome et compatible éditeur visuel.
// =====================================================================

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, Check, ArrowUpRight } from 'lucide-react';
import type { TemplatePublicationContext } from '../../schema';

export interface DispatchAuthorSidebarProps {
  publication: TemplatePublicationContext;
  className?: string;
}

export function DispatchAuthorSidebar({ publication, className = '' }: DispatchAuthorSidebarProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  };

  const name = publication.name || 'Publication';
  const bio =
    publication.heroText || 'Analyses indépendantes, récits et réflexions sans intermédiaire.';
  const logo = publication.logoUrl;

  return (
    <aside
      data-oid="dispatch_author_sidebar"
      className={`flex flex-col gap-6 lg:sticky lg:top-24 ${className}`}
    >
      {/* 1. Carte de profil de la publication */}
      <div className="p-5 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {logo ? (
            <img
              src={logo}
              alt={name}
              className="w-12 h-12 rounded-lg object-cover border border-border/80 shadow-sm"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-lg border border-primary/20">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-bold text-foreground text-base tracking-tight truncate">{name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {publication.subdomain ? `@${publication.subdomain}` : 'Édition indépendante'}
            </p>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{bio}</p>

        {/* Formulaire d'abonnement compact */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 pt-1">
          {submitted ? (
            <div className="p-2.5 rounded-lg bg-success/10 border border-success/20 text-success text-xs font-medium flex items-center gap-2">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>Merci ! Vérifiez vos emails pour confirmer.</span>
            </div>
          ) : (
            <>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  placeholder="Votre adresse email..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 px-3 rounded-lg bg-foreground text-background hover:bg-foreground/90 font-medium text-xs tracking-wide transition-colors"
              >
                S'abonner gratuitement
              </button>
            </>
          )}
        </form>
      </div>

      {/* 2. Navigation rapide & Réseaux */}
      {publication.socialLinks && publication.socialLinks.length > 0 && (
        <div className="px-1 flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/80">
            Retrouvez-moi sur
          </span>
          <div className="flex flex-wrap gap-2">
            {publication.socialLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-muted/50 hover:bg-muted text-foreground/80 hover:text-foreground border border-border/50 transition-colors"
              >
                <span className="capitalize">{link.platform}</span>
                <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 3. Footer subtil */}
      <div className="px-1 pt-2 border-t border-border/40 text-[11px] text-muted-foreground/70 flex flex-wrap gap-x-3 gap-y-1">
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
    </aside>
  );
}
