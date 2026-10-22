'use client';

// =====================================================================
// PersonCard.tsx — Carte Contributeur / Créateur (Standard Éditorial Qoefi)
// =====================================================================
// - Largeur compacte maîtrisée (max 340px, idéalement 320px)
// - Avatar rond 48px avec bordure fine et fallback initiales
// - Nom complet + Badge vérifié officiel
// - Handle @username liant au profil Core
// - Rôle éditorial / bio en 13px (line-clamp-3)
// - Actions : "S'abonner" (CTA principal compact) + "Message" (contour)
// - Cartouche d'affiliation "Écrit pour [Publication]" avec micro-logo
// =====================================================================

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, Check, Loader2 } from 'lucide-react';
import { cn } from '@qoe/utils';
import { SafeAvatar } from '../../SafeAvatar';
import { subscribeToNewsletterAction } from '@qoe/sdk/actions/tenant';

export interface PersonCardProps {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  role?: string;
  isCertified?: boolean;
  publicationName?: string | null;
  publicationLogoUrl?: string | null;
  publicationDomain?: string | null;
  publicationId?: string | null;
  className?: string;
}

export function PersonCard({
  id,
  name,
  username,
  avatarUrl,
  bio,
  role = 'Auteur',
  isCertified = false,
  publicationName,
  publicationLogoUrl,
  publicationId,
  className,
}: PersonCardProps) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [email, setEmail] = useState('');

  const authorProfileHref = username ? `/@${encodeURIComponent(username)}` : '#';

  const handleSubscribeClick = () => {
    if (isSubscribed) return;
    setShowEmailInput(true);
  };

  const handleSubscribeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !publicationId) return;

    setIsLoading(true);
    try {
      const res = await subscribeToNewsletterAction({
        email: email.trim(),
        publicationId,
      });
      if (res?.ok) {
        setIsSubscribed(true);
        setShowEmailInput(false);
        setEmail('');
      }
    } catch {
      // Ignorer l'erreur silencieusement ou garder l'input ouvert
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <article
      data-testid={`person-card-${id}`}
      className={cn(
        'w-full max-w-[340px] sm:max-w-[320px] shrink-0 rounded-[8px] border border-border/40 bg-card/40 hover:bg-card/70 transition-all duration-200 p-3.5 space-y-3 shadow-2xs',
        className
      )}
    >
      {/* ── 1. En-tête : Avatar 48px + Identité ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {username ? (
              <Link
                href={authorProfileHref}
                className="font-semibold text-sm sm:text-[15px] tracking-tight text-foreground hover:underline truncate"
              >
                {name}
              </Link>
            ) : (
              <span className="font-semibold text-sm sm:text-[15px] tracking-tight text-foreground truncate">
                {name}
              </span>
            )}

            {isCertified && (
              <span
                title="Auteur certifié Qoefi"
                className="inline-flex shrink-0 text-[#FF6719]"
                aria-label="Certifié"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2l2.4 2.5 3.4-.4 1.3 3.2 3.1 1.5-.7 3.4 2 2.8-2 2.8.7 3.4-3.1 1.5-1.3 3.2-3.4-.4L12 22l-2.4-2.5-3.4.4-1.3-3.2-3.1-1.5.7-3.4-2-2.8 2-2.8-.7-3.4 3.1-1.5 1.3-3.2 3.4.4L12 2z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {username && (
              <Link
                href={authorProfileHref}
                className="hover:text-foreground transition-colors truncate"
              >
                @{username}
              </Link>
            )}
            {username && role && <span>·</span>}
            {role && <span className="font-medium text-muted-foreground/80 truncate">{role}</span>}
          </div>
        </div>

        {/* Avatar 48px rond */}
        {username ? (
          <Link href={authorProfileHref} className="shrink-0 group/avatar block" tabIndex={-1}>
            <SafeAvatar
              src={avatarUrl}
              name={name}
              size={48}
              shape="circle"
              className="border border-border/50 shadow-2xs group-hover/avatar:opacity-90 transition-opacity"
            />
          </Link>
        ) : (
          <div className="shrink-0">
            <SafeAvatar
              src={avatarUrl}
              name={name}
              size={48}
              shape="circle"
              className="border border-border/50 shadow-2xs"
            />
          </div>
        )}
      </div>

      {/* ── 2. Biographie éditoriale (13px, concis) ── */}
      {bio && (
        <p className="text-[13px] text-muted-foreground leading-snug line-clamp-3 selection:bg-primary/20">
          {bio}
        </p>
      )}

      {/* ── 3. Actions : S'abonner + Message ── */}
      <div className="space-y-2 pt-0.5">
        {showEmailInput && !isSubscribed ? (
          <form onSubmit={handleSubscribeSubmit} className="flex items-center gap-1.5">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Votre email..."
              required
              autoFocus
              className="h-8 flex-1 rounded-[6px] border border-border/60 bg-background px-2.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
            />
            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="h-8 px-3 rounded-[6px] bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shrink-0"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'OK'}
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubscribeClick}
              disabled={isSubscribed}
              className={cn(
                'h-8 flex-1 rounded-[6px] text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                isSubscribed
                  ? 'bg-muted text-foreground/80 cursor-default'
                  : 'bg-foreground text-background hover:opacity-90 active:scale-[0.98]'
              )}
            >
              {isSubscribed ? (
                <>
                  <Check className="w-3.5 h-3.5 text-primary" />
                  <span>Abonné</span>
                </>
              ) : (
                <span>S'abonner</span>
              )}
            </button>

            {username ? (
              <Link
                href={`/@${encodeURIComponent(username)}`}
                className="h-8 flex-1 rounded-[6px] border border-border/60 hover:bg-muted/80 text-foreground text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Message</span>
              </Link>
            ) : (
              <span className="h-8 flex-1 rounded-[6px] border border-border/40 text-muted-foreground/60 text-xs font-medium flex items-center justify-center gap-1.5 opacity-60">
                <Mail className="w-3.5 h-3.5" />
                <span>Message</span>
              </span>
            )}
          </div>
        )}

        {/* ── 4. Cartouche d'affiliation publication ── */}
        {publicationName && (
          <div className="pt-2 border-t border-border/20 flex items-center gap-2 text-[11px] text-muted-foreground/80 truncate">
            {publicationLogoUrl && (
              <img
                src={publicationLogoUrl}
                alt={publicationName}
                className="w-4 h-4 rounded-[3px] object-cover shrink-0 border border-border/30"
              />
            )}
            <span className="truncate">
              Écrit pour <span className="font-medium text-foreground">{publicationName}</span>
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
