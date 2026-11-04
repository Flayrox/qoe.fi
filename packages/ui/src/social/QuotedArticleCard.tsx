'use client';

import React from 'react';
import { cn } from '@qoe/utils';
import { getArticleUrl } from '@qoe/config';
import { ArrowUpRight } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { SafeAvatar } from '../SafeAvatar';
import type { AnnotationCitation } from '../annotations/citation';

export interface QuoteContextData {
  before: string;
  highlight: string;
  after: string;
  start: number;
  end: number;
  sha: string;
}

export interface QuotedArticleData {
  id: string;
  title: string;
  slug: string;
  isPremium?: boolean;
  content?: string | null;
  // Contexte du passage résolu côté serveur (texte canonique de l'article) :
  // la carte n'a plus à stripper le HTML ni à re-chercher l'extrait.
  quoteContext?: QuoteContextData | null;
  author?: {
    name?: string | null;
    username?: string | null;
    subdomain?: string | null;
  } | null;
  publication?: {
    name?: string | null;
    subdomain?: string | null;
    customDomain?: string | null;
  } | null;
}

export interface QuotedArticleCardProps {
  article?: QuotedArticleData | null;
  quotedExcerpt?: string;
  /**
   * Annotation citée : la note et son auteur sont la citation ; le passage
   * et l'article en sont la preuve. Sans ce champ, la carte reste la
   * citation d'un simple passage.
   */
  citation?: AnnotationCitation | null;
  onOpenArticle?: (article: QuotedArticleData) => void;
  /**
   * Maillon d'une chaîne de citations : la carte perd sa boîte et son
   * pied de page. Le rayon, le filet de marque et le titre restent — c'est
   * le même objet, simplement moins prioritaire qu'au premier niveau.
   */
  compact?: boolean;
  className?: string;
}

/**
 * La couche « annotation » d'une citation : qui a écrit, et ce qu'il a
 * écrit. Employée par la carte du feed ET par l'aperçu du tiroir, pour
 * qu'on ne voie jamais deux présentations différentes du même objet.
 */
export function AnnotationCitationHeading({
  citation,
  className,
}: {
  citation: AnnotationCitation;
  className?: string;
}) {
  const handle = citation.reader.username;
  // Sans nom, le handle tient lieu d'identité : « Annotation de un lecteur
  // @lila » n'attribuerait la note à personne.
  const name = citation.reader.name || (handle ? `@${handle}` : t`un lecteur`);

  return (
    <div data-annotation-citation className={cn('space-y-2', className)}>
      <div className="flex min-w-0 items-center gap-2">
        <SafeAvatar
          id={citation.reader.id}
          src={citation.reader.logoUrl}
          name={name}
          username={handle}
          type={citation.reader.type}
          size={24}
          className="border border-border/40"
        />
        <p className="type-control-xs min-w-0 truncate text-muted-foreground">
          <span className="font-medium text-foreground">{t`Annotation de ${name}`}</span>
          {handle && citation.reader.name && <span className="ml-1">@{handle}</span>}
        </p>
      </div>

      <blockquote className="border-l-2 border-brand/60 pl-3 font-serif text-sm leading-relaxed text-pretty text-foreground">
        {t`« ${citation.note} »`}
      </blockquote>
    </div>
  );
}

export function QuotedArticleCard({
  article,
  quotedExcerpt,
  citation,
  onOpenArticle,
  compact = false,
  className,
}: QuotedArticleCardProps) {
  // Dégradation gracieuse : l'article a été supprimé ou dépublié, mais
  // l'annotation citée (sa note, son auteur, son extrait) reste valide
  // et ne doit jamais rendre la pensée vide ou faire planter l'interface.
  if (!article) {
    if (!citation) return null;

    const excerpt = citation.excerpt || quotedExcerpt;

    return (
      <div
        data-quoted-annotation={citation.id}
        className={cn(
          'relative border border-border/30 bg-muted/20 space-y-3 font-sans select-none',
          compact ? 'my-1 rounded-lg p-3' : 'my-2.5 rounded-xl p-4',
          className
        )}
      >
        {/* Quiet Left Hairline Accent Indicator */}
        <div className="absolute top-3 bottom-3 left-0 w-[3px] bg-brand/80 rounded-r-full" />

        {/* Clean Header: Type */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-medium text-muted-foreground min-w-0">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
              {t`Citation`}
            </span>
          </div>
        </div>

        {/* Couche annotation : la citation elle-même (note + auteur). */}
        <AnnotationCitationHeading citation={citation} />

        {/* Integrated Quoted Excerpt */}
        {excerpt && (
          <div className="relative pl-3 border-l-2 border-brand/50 py-0.5">
            <p className="font-serif text-sm italic leading-relaxed text-foreground/90">
              {t`« ${excerpt} »`}
            </p>
          </div>
        )}

        {/* Calm note without clickable navigation to deleted article */}
        <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/20 text-muted-foreground">
          <span className="italic text-muted-foreground/80">{t`Article indisponible`}</span>
        </div>
      </div>
    );
  }

  const authorName = article.author?.name || article.author?.username || t`Auteur`;
  const articleDomain =
    article.author?.subdomain ||
    article.publication?.subdomain ||
    article.publication?.customDomain;
  const subdomain = articleDomain ? articleDomain.replace(/^https?:\/\//, '') : 'qoefi';

  // 1) Contexte serveur (texte canonique, passages résolus par le backend) —
  //    chemin privilégié : zéro strip HTML, zéro indexOf.
  const serverContext = article.quoteContext;
  const beforeContext = serverContext?.before ?? '';
  let highlightedText = serverContext?.highlight ?? '';
  let afterContext = serverContext?.after ?? '';

  // 2) Repli : aucun contexte serveur mais un extrait — chip sans contexte.
  if (!serverContext && quotedExcerpt) {
    highlightedText = quotedExcerpt.replace(/\s+/g, ' ').trim();
    afterContext = '';
  }

  // 3) Dernier filet (composeur, preview client) : le HTML brut est encore
  //    disponible et l'extrait absent — on affiche le début du texte.
  if (!serverContext && !quotedExcerpt) {
    const rawText = article.content
      ? article.content
          .replace(/<[^>]*>/gm, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
    if (rawText) {
      highlightedText = rawText.substring(0, 130);
      afterContext = rawText.length > 130 ? '...' : '';
    }
  }

  // 🔦 Deep-link (tranche 6-b) : le passage cité est transmis par query
  // params (hlStart/hlEnd/hlSha) — l'article s'ouvre sur le passage exact.
  const quoteParams = serverContext
    ? `?hlStart=${serverContext.start}&hlEnd=${serverContext.end}&hlSha=${encodeURIComponent(
        serverContext.sha
      )}`
    : '';

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onOpenArticle) {
      // Le drawer extrait le quoteContext de l'article pour le spotlight.
      onOpenArticle(article);
    } else {
      const baseUrl = getArticleUrl(article, { preferTenant: true });
      const targetUrl = quoteParams ? `${baseUrl}${quoteParams}` : baseUrl;
      window.open(targetUrl, '_blank');
    }
  };

  return (
    <div
      onClick={handleClick}
      data-quoted-annotation={citation ? citation.id : undefined}
      className={cn(
        'group/quote relative border border-border/30 bg-muted/20 transition-all duration-200 cursor-pointer space-y-3 font-sans select-none hover:border-border/60 hover:bg-muted/35',
        compact ? 'my-1 rounded-lg p-3' : 'my-2.5 rounded-xl p-4',
        className
      )}
    >
      {/* Quiet Left Hairline Accent Indicator */}
      <div className="absolute top-3 bottom-3 left-0 w-[3px] bg-brand/80 rounded-r-full" />

      {/* Clean Header: Domain & Type */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-medium text-muted-foreground min-w-0">
          <span className="font-semibold text-foreground truncate">{subdomain}</span>
          <span className="opacity-40">·</span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
            {citation ? t`Citation` : t`Article`}
          </span>
          {article.isPremium && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-highlight/15 text-highlight border border-highlight/30 shrink-0">
              {t`PAYANT`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground group-hover/quote:text-brand transition-colors shrink-0">
          <span>{t`Ouvrir`}</span>
          <ArrowUpRight className="w-3.5 h-3.5 opacity-70 group-hover/quote:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Couche annotation : la citation elle-même (note + auteur). */}
      {citation && <AnnotationCitationHeading citation={citation} />}

      {/* Article Title */}
      <h4
        className={cn(
          'font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover/quote:text-brand',
          compact ? 'text-sm' : 'text-base'
        )}
      >
        {article.title}
      </h4>

      {/* Integrated Quoted Excerpt (Rauno Craft Style: No Boxception, No Fluorescent Yellow) */}
      {citation?.excerpt && !highlightedText && (
        <div className="relative pl-3 border-l-2 border-brand/50 py-0.5">
          <p className="font-serif text-sm italic leading-relaxed text-foreground/90">
            {t`« ${citation.excerpt} »`}
          </p>
        </div>
      )}
      {highlightedText && (
        <div className="relative pl-3 border-l-2 border-brand/50 py-0.5 space-y-1">
          <p className="text-xs sm:text-sm font-serif leading-relaxed text-foreground/90 italic">
            {beforeContext && (
              <span className="text-muted-foreground/60 not-italic">{beforeContext} </span>
            )}
            <mark className="font-medium text-foreground not-italic bg-highlight/20 dark:bg-highlight/30 px-1 py-0.5 rounded">
              {highlightedText}
            </mark>
            {afterContext && (
              <span className="text-muted-foreground/60 not-italic"> {afterContext}</span>
            )}
          </p>
        </div>
      )}

      {/* Footer Credit & Action — masqué en maillon : il répéterait ce que
          la carte de pensée citée dit déjà deux lignes plus haut. */}
      <div
        className={cn(
          'flex items-center justify-between border-t border-border/20 pt-1.5 text-xs text-muted-foreground',
          compact && 'hidden'
        )}
      >
        <div>
          {t`Par`} <span className="font-medium text-foreground">{authorName}</span>
        </div>

        <div className="flex items-center gap-1 font-medium text-xs text-brand group-hover/quote:translate-x-0.5 transition-transform">
          <span>{t`Lire l'article`}</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
}
