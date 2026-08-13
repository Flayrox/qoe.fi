'use client';

import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Clock, TrendingUp, Sparkles, Megaphone, ArrowUpRight } from 'lucide-react';

interface Author {
  id: string;
  name: string | null;
  username: string | null;
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified?: boolean;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl?: string | null;
  published: boolean;
  isPremium: boolean;
  readingTime: number;
  createdAt: Date | string;
  author: Author;
  category: { name: string } | null;
}

interface Trend {
  id: string;
  hashtag: string;
  count: number;
}

interface PartnerPromo {
  id: string;
  title: string;
  description: string;
  ctaText: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

interface HomeWidgetsProps {
  featuredArticle: Article | null;
  recommendedArticles: Article[];
  trends: Trend[];
  promos: PartnerPromo[];
}

const springs = {
  card: { type: 'spring' as const, stiffness: 350, damping: 28 },
};

export function HomeWidgets({
  featuredArticle,
  recommendedArticles,
  trends,
  promos,
}: HomeWidgetsProps) {
  const carouselRef = useRef<HTMLDivElement>(null);

  // Scroll vertical de la souris traduit en scroll horizontal uniquement lors du survol
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * 0.8;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <div className="w-full relative py-2 select-none">
      {/* Container horizontal */}
      <div
        ref={carouselRef}
        className="flex gap-4 overflow-x-auto scrollbar-none items-stretch pb-2 scroll-smooth"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingLeft: 'var(--carousel-padding)',
          paddingRight: 'var(--carousel-padding)',
        }}
      >
        {/* 1. ARTICLES A LA UNE (Featured) */}
        {featuredArticle && <FeaturedCard article={featuredArticle} />}

        {/* 2. ARTICLES RECOMMANDE (Recommendation) - en grand nombre */}
        {recommendedArticles.map((article) => (
          <RecommendedCard key={article.id} article={article} />
        ))}

        {/* 3. SUJETS D'ACTUALITE (Trends list) */}
        {trends && trends.length > 0 && <TrendsCard trends={trends} />}

        {/* 4. ADS / PARTENAIRE (PartnerPromo) */}
        {promos && promos.map((promo) => <PromoCard key={promo.id} promo={promo} />)}
      </div>
    </div>
  );
}

// ── Widget: Article à la une ──────────────────────────────────────────────────
function FeaturedCard({ article }: { article: Article }) {
  const isProd =
    typeof window !== 'undefined'
      ? window.location.hostname.endsWith('qoe.fi')
      : process.env.NODE_ENV === 'production';
  const suffix = isProd ? 'qoe.fi' : 'localhost';
  const protocol = isProd ? 'https:' : 'http:';
  const host =
    article.author.customDomain ||
    (article.author.subdomain ? `${article.author.subdomain}.${suffix}` : '');
  const url = host ? `${protocol}//${host}/article/${article.slug}` : '#';

  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      transition={springs.card}
      className="flex-shrink-0 w-[300px] h-[160px] bg-card border border-border/40 rounded-xl p-4 shadow-xs flex flex-col justify-between cursor-pointer"
      onClick={() => window.open(url, '_blank', 'noreferrer')}
    >
      <div className="space-y-2">
        {/* Top Meta */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-sm overflow-hidden border border-border/40">
              {article.author.logoUrl ? (
                <Image
                  src={article.author.logoUrl}
                  width={20}
                  height={20}
                  className="w-full h-full object-cover"
                  alt=""
                />
              ) : (
                <div className="w-full h-full bg-brand/10 flex items-center justify-center font-bold text-[9px] text-brand">
                  {article.author.name?.substring(0, 2) || 'NA'}
                </div>
              )}
            </div>
            <span className="text-[10px] font-bold text-foreground truncate max-w-[120px]">
              {article.author.name}
            </span>
            {article.author.isCertified && (
              <span className="w-2.5 h-2.5 rounded-full bg-brand flex items-center justify-center text-[6px] text-background font-bold">
                ✓
              </span>
            )}
          </div>

          <span className="text-[8px] font-black uppercase tracking-[0.1em] bg-brand text-background px-2 py-0.5 rounded-full">
            À la une
          </span>
        </div>

        {/* Title */}
        <h4 className="font-sans text-xs font-bold text-foreground leading-snug tracking-tight line-clamp-3 hover:text-brand transition-colors">
          {article.title}
        </h4>
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30 text-[9px] text-muted-foreground font-sans">
        <span className="uppercase font-bold tracking-wider">
          {article.category?.name || 'Général'}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {article.readingTime} min
        </span>
      </div>
    </motion.div>
  );
}

// ── Widget: Article Recommandé ────────────────────────────────────────────────
function RecommendedCard({ article }: { article: Article }) {
  const isProd =
    typeof window !== 'undefined'
      ? window.location.hostname.endsWith('qoe.fi')
      : process.env.NODE_ENV === 'production';
  const suffix = isProd ? 'qoe.fi' : 'localhost';
  const protocol = isProd ? 'https:' : 'http:';
  const host =
    article.author.customDomain ||
    (article.author.subdomain ? `${article.author.subdomain}.${suffix}` : '');
  const url = host ? `${protocol}//${host}/article/${article.slug}` : '#';

  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      transition={springs.card}
      className="flex-shrink-0 w-[280px] h-[160px] bg-card border border-border/40 rounded-xl p-4 shadow-xs flex flex-col justify-between cursor-pointer"
      onClick={() => window.open(url, '_blank', 'noreferrer')}
    >
      <div className="space-y-2">
        {/* Top Meta */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-sm overflow-hidden border border-border/40">
              {article.author.logoUrl ? (
                <Image
                  src={article.author.logoUrl}
                  width={20}
                  height={20}
                  className="w-full h-full object-cover"
                  alt=""
                />
              ) : (
                <div className="w-full h-full bg-brand/10 flex items-center justify-center font-bold text-[9px] text-brand">
                  {article.author.name?.substring(0, 2) || 'NA'}
                </div>
              )}
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground truncate max-w-[120px]">
              {article.author.name}
            </span>
          </div>

          <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-brand bg-brand/10 px-2 py-0.5 rounded-full flex items-center gap-0.5">
            <Sparkles className="w-2 h-2" />
            Pour vous
          </span>
        </div>

        {/* Title */}
        <h4 className="font-sans text-xs font-bold text-foreground leading-snug tracking-tight line-clamp-3 hover:text-brand transition-colors">
          {article.title}
        </h4>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30 text-[9px] text-muted-foreground font-sans">
        <span className="uppercase font-bold tracking-wider">
          {article.category?.name || 'Recommandation'}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {article.readingTime} min
        </span>
      </div>
    </motion.div>
  );
}

// ── Widget: Trending topics list ──────────────────────────────────────────────
function TrendsCard({ trends }: { trends: Trend[] }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={springs.card}
      className="flex-shrink-0 w-[260px] h-[160px] bg-card border border-border/40 rounded-xl p-4 shadow-xs flex flex-col justify-between"
    >
      <div className="space-y-1.5 flex-1 overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-brand" />
            Tendances
          </span>
        </div>

        {/* Trends List */}
        <div className="space-y-2">
          {trends.slice(0, 3).map((trend) => (
            <div
              key={trend.id}
              onClick={() => {
                // If it is #attention, filter or link to explorer
                window.location.href = `/home?tag=${encodeURIComponent(trend.hashtag)}`;
              }}
              className="flex items-center justify-between group/trend cursor-pointer hover:bg-muted/50 p-1.5 rounded transition-all duration-150"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-bold text-foreground truncate tracking-tight group-hover/trend:text-brand transition-colors">
                  {trend.hashtag}
                </span>
                <span className="text-[9px] text-muted-foreground font-sans">
                  {trend.count} lectures
                </span>
              </div>
              <ArrowUpRight className="w-3 h-3 text-muted-foreground/60 opacity-0 group-hover/trend:opacity-100 group-hover/trend:text-brand transition-all" />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Widget: Ads / Partner promotion ───────────────────────────────────────────
function PromoCard({ promo }: { promo: PartnerPromo }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      transition={springs.card}
      className="flex-shrink-0 w-[260px] h-[160px] bg-card border border-border/40 rounded-xl p-4 shadow-xs flex flex-col justify-between cursor-pointer"
      onClick={() => {
        if (promo.ctaUrl) {
          window.location.href = promo.ctaUrl;
        }
      }}
    >
      <div className="space-y-1">
        {/* Top Header */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1">
            <Megaphone className="w-2.5 h-2.5 text-muted-foreground" />
            Partenaire
          </span>
          {promo.ctaText && (
            <span className="text-[8px] font-bold text-brand hover:underline flex items-center gap-0.5">
              {promo.ctaText}
              <ArrowUpRight className="w-2.5 h-2.5" />
            </span>
          )}
        </div>

        {/* Info */}
        <h4 className="font-sans text-xs font-bold text-[var(--text-primary)] leading-tight tracking-tight">
          {promo.title}
        </h4>
        <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed line-clamp-3 pt-0.5">
          {promo.description}
        </p>
      </div>

      {/* Subtle branding */}
      <div className="text-[8px] text-[var(--text-quaternary)] font-bold uppercase tracking-wider text-right">
        Sponsorisé
      </div>
    </motion.div>
  );
}
