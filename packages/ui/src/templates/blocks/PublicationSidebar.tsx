'use client';

// =====================================================================
// PublicationSidebar.tsx — Colonne Latérale Éditoriale
// =====================================================================
// Affiche :
// 1. Carte de l'Auteur / Publication ("À propos")
// 2. Réseau de Recommandations ("Recommandé par [Auteur]") avec abonnement 1-clic
// 3. Boîte d'Abonnement Newsletter Sticky
// 4. Sélection "À ne pas manquer" (Top Lectures)
// =====================================================================

import React, { useState } from 'react';
import Link from 'next/link';
import { Sparkles, ExternalLink, Check, Loader2, Mail, BookOpen } from 'lucide-react';
import { cn } from '@qoe/utils';
import { SafeAvatar } from '../../SafeAvatar';
import { SubscribeForm } from '../../SubscribeForm';
import { subscribeToNewsletterAction } from '@qoe/sdk/actions/tenant';
import type {
  TemplatePublicationContext,
  TemplateArticleItem,
  TemplateRecommendationItem,
  TemplateRenderContext,
} from '../schema';

export interface PublicationSidebarProps {
  publication?: TemplatePublicationContext;
  articles?: TemplateArticleItem[];
  context: TemplateRenderContext;
  className?: string;
}

// Recommandations par défaut élégantes du réseau souverain Qoefi (si l'auteur n'en a pas encore configuré)
const CURATED_DEFAULT_RECOMMENDATIONS: TemplateRecommendationItem[] = [
  {
    id: 'rec_souverainete',
    name: 'Souveraineté & Médias',
    slug: 'souverainete-medias',
    subdomain: 'souverainete',
    description: 'Chroniques sur l’indépendance éditoriale et le web décentralisé.',
    customDomain: null,
    articlesCount: 14,
    subscribersCount: 1200,
  },
  {
    id: 'rec_craft',
    name: 'Atelier Craft & Code',
    slug: 'atelier-craft',
    subdomain: 'craft',
    description: 'Micro-craft, typographie d’orfèvre et architecture de contenu.',
    customDomain: null,
    articlesCount: 8,
    subscribersCount: 850,
  },
];

export function PublicationSidebar({
  publication,
  articles = [],
  context,
  className = '',
}: PublicationSidebarProps) {
  const [subscribedMap, setSubscribedMap] = useState<Record<string, boolean>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [activeInlineEmailId, setActiveInlineEmailId] = useState<string | null>(null);
  const [inlineEmail, setInlineEmail] = useState('');

  const authorName = publication?.name || 'L’Auteur';
  const bio = publication?.heroText || publication?.author?.bio || null;
  const avatarUrl = publication?.logoUrl || publication?.author?.avatarUrl || null;
  const recommendations =
    publication?.recommendations && publication.recommendations.length > 0
      ? publication.recommendations
      : CURATED_DEFAULT_RECOMMENDATIONS;

  // Articles secondaires pour le bloc "Top Lectures" (affiché s'il y a au moins 5 articles pour éviter les doublons avec le flux)
  const topArticles = articles.length >= 5 ? articles.slice(1, 4) : [];

  const handleSubscribeClick = (rec: TemplateRecommendationItem) => {
    if (context.mode === 'editable') return;
    if (subscribedMap[rec.id]) return;
    setActiveInlineEmailId(rec.id);
  };

  const handleInlineSubscribeSubmit = async (e: React.FormEvent, recId: string) => {
    e.preventDefault();
    if (!inlineEmail.trim()) return;

    setLoadingMap((prev) => ({ ...prev, [recId]: true }));
    try {
      const res = await subscribeToNewsletterAction({
        email: inlineEmail.trim(),
        publicationId: recId,
      });
      if (res?.ok) {
        setSubscribedMap((prev) => ({ ...prev, [recId]: true }));
        setActiveInlineEmailId(null);
        setInlineEmail('');
      }
    } catch (err) {
      console.warn('[PublicationSidebar] subscribe error:', err);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [recId]: false }));
    }
  };

  return (
    <aside className={cn('space-y-6', className)}>
      {/* ── 1. CARTE DE L'AUTEUR / PUBLICATION ("À propos") ── */}
      <div className="p-5 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/50 shadow-2xs space-y-3.5">
        <div className="flex items-center gap-3">
          <SafeAvatar
            src={avatarUrl}
            name={authorName}
            size={46}
            shape="squircle"
            className="border border-border/60 shrink-0 shadow-2xs"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm sm:text-base tracking-tight text-foreground truncate">
              {authorName}
            </h3>
            {publication?.domain && (
              <p className="text-[11px] text-muted-foreground truncate">{publication.domain}</p>
            )}
          </div>
        </div>

        {bio && (
          <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed line-clamp-4">
            {bio}
          </p>
        )}

        {publication?.socialLinks && publication.socialLinks.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/30">
            {publication.socialLinks.map((s, idx) => (
              <a
                key={s.id || idx}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider px-2 py-0.5 rounded-md hover:bg-muted/60"
              >
                {s.platform}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── 2. RÉSEAU DE RECOMMANDATIONS ("Recommandé par...") ── */}
      {(publication?.siteOptions?.showRecommendationsInSidebar ?? true) !== false && (
        <div className="p-5 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/50 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 text-[var(--tenant-accent,hsl(var(--primary)))]" />
              <span>Recommandé par {authorName}</span>
            </div>
            <span className="text-[11px] font-medium text-muted-foreground/60">
              {recommendations.length}
            </span>
          </div>

          <div className="space-y-3 divide-y divide-border/30">
            {recommendations.map((rec) => {
              const isSubscribed = Boolean(subscribedMap[rec.id]);
              const isLoading = Boolean(loadingMap[rec.id]);
              const isInputOpen = activeInlineEmailId === rec.id;
              const targetUrl = (() => {
                if (rec.customDomain) return `https://${rec.customDomain}`;
                if (!rec.subdomain) return '#';
                if (typeof window !== 'undefined') {
                  const host = window.location.hostname;
                  if (host.endsWith('lvh.me')) return `http://${rec.subdomain}.lvh.me:15403`;
                  if (host.endsWith('localhost')) return `http://${rec.subdomain}.localhost:15403`;
                  if (host.endsWith('qoe.test')) return `http://${rec.subdomain}.qoe.test`;
                }
                return `https://${rec.subdomain}.qoe.fi`;
              })();

              return (
                <div key={rec.id} className="pt-3 first:pt-0 space-y-2 group/rec">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <SafeAvatar
                        src={rec.logoUrl || rec.authorAvatarUrl}
                        name={rec.name}
                        size={34}
                        shape="squircle"
                        className="border border-border/40 shrink-0 mt-0.5 shadow-2xs"
                      />
                      <div className="min-w-0 flex-1">
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-xs sm:text-[13px] text-foreground hover:text-primary transition-colors truncate max-w-full"
                        >
                          <span className="truncate">{rec.name}</span>
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover/rec:opacity-60 transition-opacity shrink-0" />
                        </a>
                        {rec.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1 leading-normal mt-0.5">
                            {rec.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSubscribeClick(rec)}
                      disabled={isLoading || isSubscribed}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer border',
                        isSubscribed
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-muted/70 hover:bg-foreground hover:text-background border-border/50 text-foreground shadow-2xs active:scale-95'
                      )}
                    >
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isSubscribed ? (
                        <span className="inline-flex items-center gap-1">
                          <Check className="w-3 h-3" /> Abonné
                        </span>
                      ) : (
                        "S'abonner"
                      )}
                    </button>
                  </div>

                  {/* Formulaire inline rapide */}
                  {isInputOpen && !isSubscribed && (
                    <form
                      onSubmit={(e) => handleInlineSubscribeSubmit(e, rec.id)}
                      className="flex items-center gap-1.5 pt-1 animate-in fade-in slide-in-from-top-1 duration-200"
                    >
                      <input
                        type="email"
                        value={inlineEmail}
                        onChange={(e) => setInlineEmail(e.target.value)}
                        placeholder="Votre email..."
                        required
                        autoFocus
                        className="flex-1 min-w-0 h-7 text-xs px-2 rounded-md bg-background border border-border/60 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="h-7 px-2.5 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                      >
                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'OK'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveInlineEmailId(null)}
                        className="h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        ✕
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. FORMULAIRE D'ABONNEMENT STICKY (Boîte aux lettres) ── */}
      <div className="p-5 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/50 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Mail className="w-3.5 h-3.5 text-[var(--tenant-accent,hsl(var(--primary)))]" />
          <span>Newsletter</span>
        </div>
        <h4 className="font-semibold text-sm tracking-tight text-foreground">
          Recevez les prochains écrits
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Directement dans votre boîte mail. Zéro spam, désinscription libre en un clic.
        </p>
        <div className="pt-1">
          <SubscribeForm
            publicationId={publication?.id || ''}
            authorName={authorName}
            accentColor={publication?.accentColor || undefined}
            placeholder="Votre adresse email..."
            buttonText="S’abonner"
            size="compact"
            disabled={context.mode === 'editable'}
          />
        </div>
      </div>

      {/* ── 4. SÉLECTION TOP LECTURES (Articles secondaires) ── */}
      {topArticles.length > 0 && (
        <div className="p-5 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/50 shadow-2xs space-y-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <BookOpen className="w-3.5 h-3.5 text-[var(--tenant-accent,hsl(var(--primary)))]" />
            <span>À ne pas manquer</span>
          </div>

          <div className="space-y-3">
            {topArticles.map((art, idx) => (
              <div key={art.id} className="flex items-start gap-3 group/top">
                <span className="text-xs font-semibold text-muted-foreground/50 shrink-0 mt-0.5">
                  0{idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/article/${art.slug}`}
                    onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                    className="font-medium text-xs sm:text-[13px] text-foreground hover:text-primary transition-colors line-clamp-2 leading-snug"
                  >
                    {art.title}
                  </Link>
                  {art.readingTime && (
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">
                      {art.readingTime} min de lecture
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
