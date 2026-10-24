'use client';

// =====================================================================
// PublicationSidebar.tsx — Colonne Latérale Éditoriale
// =====================================================================
// Affiche :
// 1. Carte de l'Auteur / Publication ("À propos")
// 2. Réseau de Recommandations (uniquement celles réellement configurées)
// 3. Boîte d'Abonnement Newsletter Sticky
// 4. Sélection "Les plus lus" (classée par popularité réelle)
// =====================================================================

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, Loader2 } from 'lucide-react';
import { buildArticlePath, cn } from '@qoe/utils';
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
  /** Désactivé quand la grille à la une affiche déjà sa propre colonne « Les plus lus ». */
  showTopArticles?: boolean;
}

/** Score de popularité simple et transparent : likes + 2×commentaires + 2×repartages. */
function popularityScore(article: TemplateArticleItem): number {
  return (
    (article.likesCount ?? 0) + (article.commentsCount ?? 0) * 2 + (article.repostsCount ?? 0) * 2
  );
}

export function PublicationSidebar({
  publication,
  articles = [],
  context,
  className = '',
  showTopArticles = true,
}: PublicationSidebarProps) {
  const [subscribedMap, setSubscribedMap] = useState<Record<string, boolean>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [activeInlineEmailId, setActiveInlineEmailId] = useState<string | null>(null);
  const [inlineEmail, setInlineEmail] = useState('');

  const authorName = publication?.name || 'L’Auteur';
  const bio = publication?.heroText || publication?.author?.bio || null;
  const avatarUrl = publication?.logoUrl || publication?.author?.avatarUrl || null;

  // Aucune recommandation inventée : si l'auteur n'en a pas configuré,
  // le bloc disparaît au lieu d'afficher des publications fictives.
  const recommendations: TemplateRecommendationItem[] =
    publication?.recommendations && publication.recommendations.length > 0
      ? publication.recommendations
      : [];

  // Affiché seulement quand l'archive est assez fournie : sinon le flux
  // juste à côté montre déjà les mêmes titres.
  const leadingArticleId = articles[0]?.id;
  const topArticles =
    showTopArticles && articles.length >= 5
      ? [...articles]
          .filter((article) => article.id !== leadingArticleId)
          .sort((a, b) => popularityScore(b) - popularityScore(a))
          .slice(0, 3)
      : [];

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

  const targetUrlFor = (rec: TemplateRecommendationItem) => {
    if (rec.customDomain) return `https://${rec.customDomain}`;
    if (!rec.subdomain) return '#';
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host.endsWith('lvh.me')) return `http://${rec.subdomain}.lvh.me:15403`;
      if (host.endsWith('localhost')) return `http://${rec.subdomain}.localhost:15403`;
      if (host.endsWith('qoe.test')) return `http://${rec.subdomain}.qoe.test`;
    }
    return `https://${rec.subdomain}.qoe.fi`;
  };

  return (
    <aside className={cn('flex flex-col divide-y divide-border/60 text-sm', className)}>
      {/* ── 1. À PROPOS ── */}
      <section className="pb-6">
        <div className="flex items-center gap-3">
          <SafeAvatar
            src={avatarUrl}
            name={authorName}
            size={40}
            shape="circle"
            className="border border-border/60 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-medium tracking-tight text-foreground truncate">{authorName}</h3>
            {publication?.domain && (
              <p className="text-[11px] text-muted-foreground truncate">{publication.domain}</p>
            )}
          </div>
        </div>

        {bio && (
          <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed line-clamp-4">
            {bio}
          </p>
        )}

        {publication?.socialLinks && publication.socialLinks.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            {publication.socialLinks.map((s, idx) => (
              <a
                key={s.id || idx}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors capitalize"
              >
                {s.platform}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* ── 2. RECOMMANDATIONS (uniquement si configurées) ── */}
      {recommendations.length > 0 &&
        (publication?.siteOptions?.showRecommendationsInSidebar ?? true) !== false && (
          <section className="py-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Recommandé par {authorName}
            </p>

            <ul className="mt-4 space-y-5">
              {recommendations.map((rec) => {
                const isSubscribed = Boolean(subscribedMap[rec.id]);
                const isLoading = Boolean(loadingMap[rec.id]);
                const isInputOpen = activeInlineEmailId === rec.id;
                const targetUrl = targetUrlFor(rec);

                return (
                  <li key={rec.id}>
                    <div className="flex items-start gap-3">
                      <SafeAvatar
                        src={rec.logoUrl || rec.authorAvatarUrl}
                        name={rec.name}
                        size={30}
                        shape="circle"
                        className="border border-border/50 shrink-0 mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block font-medium text-[13px] text-foreground hover:underline underline-offset-4 truncate"
                        >
                          {rec.name}
                        </a>
                        {rec.description && (
                          <p className="mt-0.5 text-[11.5px] text-muted-foreground line-clamp-2 leading-snug">
                            {rec.description}
                          </p>
                        )}
                        {!isSubscribed && !isInputOpen && (
                          <button
                            type="button"
                            onClick={() => handleSubscribeClick(rec)}
                            disabled={isLoading}
                            className="mt-1.5 text-[11px] font-medium text-muted-foreground underline underline-offset-4 decoration-border hover:text-foreground transition-colors cursor-pointer"
                          >
                            {isLoading ? 'Envoi…' : "S'abonner"}
                          </button>
                        )}
                        {isSubscribed && (
                          <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Check className="w-3 h-3" /> Abonné
                          </span>
                        )}
                        {isInputOpen && !isSubscribed && (
                          <form
                            onSubmit={(e) => handleInlineSubscribeSubmit(e, rec.id)}
                            className="mt-2 flex items-center gap-1.5"
                          >
                            <input
                              type="email"
                              value={inlineEmail}
                              onChange={(e) => setInlineEmail(e.target.value)}
                              placeholder="Votre email"
                              required
                              autoFocus
                              className="flex-1 min-w-0 h-7 text-[11px] px-2 bg-transparent border-b border-border focus:outline-none focus:border-foreground text-foreground placeholder:text-muted-foreground"
                            />
                            <button
                              type="submit"
                              disabled={isLoading}
                              className="h-7 px-1.5 text-[11px] font-medium text-foreground hover:opacity-70 transition-opacity cursor-pointer shrink-0"
                            >
                              {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'OK'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveInlineEmailId(null)}
                              className="h-7 px-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                              aria-label="Annuler"
                            >
                              ✕
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

      {/* ── 3. NEWSLETTER ── */}
      <section id="subscribe" className="py-6 scroll-mt-24">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Newsletter
        </p>
        <p className="mt-2 text-[13px] text-foreground leading-snug">
          Recevez les prochains écrits dans votre boîte mail.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Pas de spam, désinscription en un clic.
        </p>
        <div className="mt-3">
          <SubscribeForm
            publicationId={publication?.id || ''}
            authorName={authorName}
            accentColor={publication?.accentColor || undefined}
            placeholder="Votre adresse email"
            buttonText="S’abonner"
            size="compact"
            disabled={context.mode === 'editable'}
            mainAppUrl={publication?.mainAppUrl}
          />
        </div>
      </section>

      {/* ── 4. LES PLUS LUS (popularité réelle) ── */}
      {topArticles.length > 0 && (
        <section className="pt-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Les plus lus
          </p>
          <ol className="mt-4 space-y-4">
            {topArticles.map((art, idx) => (
              <li key={art.id} className="flex items-start gap-3">
                <span className="text-[11px] tabular-nums text-muted-foreground/60 shrink-0 mt-0.5">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={buildArticlePath(art)}
                    onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                    className="block text-[13px] font-medium text-foreground leading-snug hover:underline underline-offset-4"
                  >
                    {art.title}
                  </Link>
                  {art.readingTime && (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {art.readingTime} min de lecture
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}
