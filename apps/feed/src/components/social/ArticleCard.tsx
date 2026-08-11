"use client";

import React from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Clock, Sparkles, Lock, ShieldCheck } from "lucide-react";

export interface ArticleCardData {
  id: string;
  title: string;
  slug: string;
  content: string;
  readingTime?: number;
  isPremium?: boolean;
  visibility?: "PUBLIC" | "MEMBERS_ONLY" | "PAID_SUBSCRIBERS" | "TIER_SPECIFIC";
  createdAt: string | Date;
  author: {
    id: string;
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
    subdomain?: string | null;
    customDomain?: string | null;
    isCertified?: boolean;
  };
  category?: {
    name: string;
    slug?: string;
  } | null;
  _count?: {
    bookmarks?: number;
    highlights?: number;
  };
}

export interface ArticleCardProps {
  article: ArticleCardData;
  onOpenReader?: (article: ArticleCardData) => void;
}

export function ArticleCard({ article, onOpenReader }: ArticleCardProps) {
  const authorName = article.author.name || article.author.username || "Auteur";
  const excerpt = article.content ? article.content.replace(/<[^>]*>?/gm, "").slice(0, 160) + "..." : "";

  // External tenant domain URL
  const tenantUrl = article.author.customDomain
    ? `https://${article.author.customDomain}/article/${encodeURIComponent(article.slug)}`
    : article.author.subdomain
    ? `https://${article.author.subdomain}.qoe.fi/article/${encodeURIComponent(article.slug)}`
    : `/article/${encodeURIComponent(article.slug)}`;

  const getVisibilityBadge = () => {
    switch (article.visibility) {
      case "PAID_SUBSCRIBERS":
      case "TIER_SPECIFIC":
        return {
          label: "Abonnés payants",
          className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
          icon: Lock,
        };
      case "MEMBERS_ONLY":
        return {
          label: "Membres",
          className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
          icon: ShieldCheck,
        };
      default:
        return null;
    }
  };

  const badge = getVisibilityBadge();
  const BadgeIcon = badge?.icon;

  const handleReadClick = (e: React.MouseEvent) => {
    if (onOpenReader) {
      e.preventDefault();
      onOpenReader(article);
    }
  };

  return (
    <article className="group relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md p-5 space-y-4 hover:border-primary/40 transition-all duration-200 shadow-xs my-3">
      {/* Category & Visibility Header */}
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
        <div className="flex items-center gap-2">
          {article.category && (
            <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px]">
              {article.category.name}
            </span>
          )}
          {badge && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${badge.className}`}>
              {BadgeIcon && <BadgeIcon className="w-3 h-3" />}
              <span>{badge.label}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px]">
          <Clock className="w-3.5 h-3.5" />
          <span>{article.readingTime || 5} min de lecture</span>
        </div>
      </div>

      {/* Title & Excerpt */}
      <div className="space-y-1.5">
        <Link
          href={`/article/${encodeURIComponent(article.slug)}`}
          onClick={handleReadClick}
          className="font-bold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug"
        >
          {article.title}
        </Link>
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {excerpt}
        </p>
      </div>

      {/* Footer Author Info & CTAs */}
      <div className="flex items-center justify-between pt-3 border-t border-border/40 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-muted overflow-hidden shrink-0">
            {article.author.logoUrl ? (
              <img src={article.author.logoUrl} alt={authorName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                {authorName[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground truncate">{authorName}</p>
            {article._count?.highlights ? (
              <p className="text-[10px] text-primary font-semibold">
                {article._count.highlights} annotation{article._count.highlights > 1 ? "s" : ""}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/article/${encodeURIComponent(article.slug)}`}
            onClick={handleReadClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-2xs"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Lire</span>
          </Link>

          <a
            href={tenantUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Ouvrir sur le site du créateur"
            className="p-1.5 rounded-full border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}
