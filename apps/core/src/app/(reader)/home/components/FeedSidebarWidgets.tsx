'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  UserCheck,
  UserPlus,
  BookOpen,
  Highlighter,
  Users,
  Sparkles,
  Flame,
  ArrowUpRight,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { SafeAvatar } from '@qoe/ui';
import { t } from '@lingui/core/macro';
import { routes } from '@qoe/config/routes';

export interface SuggestedCreator {
  id: string;
  name: string | null;
  username: string | null;
  subdomain?: string | null;
  customDomain?: string | null;
  logoUrl: string | null;
  heroText?: string | null;
  affinityScore?: number;
  recentArticleTitle?: string | null;
}

export interface SemanticTrendingTopic {
  id: string;
  topicName: string;
  description?: string;
  count: number;
  growthRate: string;
}

interface FeedSidebarWidgetsProps {
  suggestedCreators: SuggestedCreator[];
  semanticTrends?: SemanticTrendingTopic[];
  onFollowToggle: (creator: SuggestedCreator) => void;
  onOpenProfile?: (username: string) => void;
  onSelectTopic?: (topicName: string) => void;
  userStats?: {
    articlesRead: number;
    highlights: number;
    following: number;
  };
}

const springs = {
  follow: { type: 'spring' as const, stiffness: 480, damping: 30, mass: 0.6 },
};

export function FeedSidebarWidgets({
  suggestedCreators,
  semanticTrends,
  onFollowToggle,
  onOpenProfile,
  onSelectTopic,
  userStats,
}: FeedSidebarWidgetsProps) {
  const [followedLocally, setFollowedLocally] = useState<Set<string>>(new Set());
  const [justFollowed, setJustFollowed] = useState<string | null>(null);

  const handleFollow = (creator: SuggestedCreator) => {
    const alreadyFollowed = followedLocally.has(creator.id);
    if (!alreadyFollowed) {
      setJustFollowed(creator.id);
      setTimeout(() => setJustFollowed(null), 1800);
    }
    setFollowedLocally((prev) => {
      const next = new Set(prev);
      if (alreadyFollowed) {
        next.delete(creator.id);
      } else {
        next.add(creator.id);
      }
      return next;
    });
    onFollowToggle(creator);
  };

  return (
    <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-6 select-none">
      {/* ── Widget 1 : Votre Activité ── */}
      {userStats && (
        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-xs space-y-5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
            {t`Votre semaine`}
          </span>
          <div className="grid grid-cols-3 gap-2">
            <StatCell icon={BookOpen} value={userStats.articlesRead} label={t`Lus`} />
            <StatCell icon={Highlighter} value={userStats.highlights} label={t`Surlignages`} />
            <StatCell icon={Users} value={userStats.following} label={t`Abonnements`} />
          </div>

          <ActivitySparkline />
        </div>
      )}

      {/* ── Widget 2 : Créateurs suggérés par Affinité IA ── */}
      {suggestedCreators.length > 0 && (
        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
              {t`Plumes Recommandées`}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">
              {userStats ? t`Selon vos lectures` : t`Sélections de la plateforme`}
            </span>
          </div>

          <div className="space-y-4">
            {suggestedCreators.slice(0, 4).map((creator) => {
              const isFollowedLocally = followedLocally.has(creator.id);
              const isJustFollowed = justFollowed === creator.id;

              return (
                <div
                  key={creator.id}
                  className="flex flex-col gap-2 p-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors border border-border/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <motion.button
                      type="button"
                      onClick={() => {
                        const username = creator.username || creator.subdomain || '';
                        if (onOpenProfile) {
                          onOpenProfile(username);
                        } else {
                          window.location.href = routes.feed.profile(username);
                        }
                      }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1 outline-none text-left"
                    >
                      <SafeAvatar
                        src={creator.logoUrl}
                        name={creator.name}
                        username={creator.username}
                        size={36}
                        className="rounded-lg border border-border/60"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground truncate hover:text-primary transition-colors">
                            {creator.name}
                          </span>
                          {typeof creator.affinityScore === 'number' &&
                            creator.affinityScore > 0 && (
                              <span className="text-[9px] font-semibold text-primary px-1.5 py-0.5 rounded-full bg-primary/10 shrink-0">
                                {creator.affinityScore}%
                              </span>
                            )}
                        </div>
                        <span className="text-[10px] text-muted-foreground block truncate font-mono">
                          @{creator.username || creator.subdomain}
                        </span>
                      </div>
                    </motion.button>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      transition={springs.follow}
                      onClick={() => handleFollow(creator)}
                      className={cn(
                        'shrink-0 flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-md transition-colors cursor-pointer outline-none',
                        isFollowedLocally
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary text-primary-foreground hover:opacity-90'
                      )}
                    >
                      <AnimatePresence mode="wait">
                        {isJustFollowed ? (
                          <motion.span
                            key="check"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: [1.3, 1], opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={springs.follow}
                            className="flex items-center gap-1"
                          >
                            <UserCheck className="w-3 h-3" />
                            {t`Abonné !`}
                          </motion.span>
                        ) : isFollowedLocally ? (
                          <motion.span key="followed" className="flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            {t`Abonné`}
                          </motion.span>
                        ) : (
                          <motion.span key="follow" className="flex items-center gap-1">
                            <UserPlus className="w-3 h-3" />
                            {t`Suivre`}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>

                  {creator.recentArticleTitle && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1 italic pl-1 border-l-2 border-primary/40">
                      "{creator.recentArticleTitle}"
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Widget 3 : Sujets Chauds & Discussions Sémantiques (Sans Hashtags) ── */}
      {semanticTrends && semanticTrends.length > 0 && (
        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-warning" strokeWidth={2.5} />
              {t`Sujets Émergents`}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">
              {t`Cette semaine`}
            </span>
          </div>

          <div className="space-y-3">
            {semanticTrends.map((topic) => (
              <div
                key={topic.id}
                onClick={() => onSelectTopic?.(topic.topicName)}
                className="group flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer border border-transparent hover:border-border/30"
              >
                <div className="min-w-0 pr-2">
                  <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors block truncate">
                    {topic.topicName}
                  </span>
                  <span className="text-[10px] text-muted-foreground block truncate">
                    {topic.description || `${topic.count} réflexions & essais`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] font-medium text-success bg-success/10 px-1.5 py-0.5 rounded">
                    {topic.growthRate}
                  </span>
                  <ArrowUpRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function ActivitySparkline() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const data = [1, 3, 2, 5, 2, 4, 3];
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const maxVal = Math.max(...data);

  return (
    <div className="pt-3.5 border-t border-border/50 flex flex-col gap-2">
      <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
        <span>{t`Activité de lecture`}</span>
        <span className="text-primary font-semibold">
          {hoveredIndex !== null ? t`${data[hoveredIndex]} écrits` : t`7 derniers jours`}
        </span>
      </div>

      <div className="h-9 flex items-end justify-between gap-1.5 pt-1">
        {data.map((val, idx) => {
          const heightPercent = maxVal > 0 ? (val / maxVal) * 100 : 0;
          const isHovered = hoveredIndex === idx;

          return (
            <div
              key={idx}
              className="flex-1 flex flex-col items-center gap-1 group cursor-pointer"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="w-full relative h-6 flex items-end">
                <motion.div
                  animate={{
                    height: `${Math.max(heightPercent, 12)}%`,
                  }}
                  transition={{ type: 'spring', stiffness: 350, damping: 20 }}
                  className={cn(
                    'w-full rounded-xs transition-colors',
                    isHovered ? 'bg-primary' : 'bg-primary/20'
                  )}
                />
              </div>
              <span
                className={cn(
                  'text-[9px] font-medium transition-colors font-sans font-medium',
                  isHovered ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {days[idx]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCell({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-muted/50 border border-border/40">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
      <span className="text-base font-bold text-foreground leading-none tracking-tight">
        {value}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
