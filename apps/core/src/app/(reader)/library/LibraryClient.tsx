'use client';

import React, { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Highlighter,
  Clock,
  ExternalLink,
  Search,
  X,
  Copy,
  Check,
  Trash2,
  Download,
  MessageSquareQuote,
  PenLine,
  Pencil,
  Plus,
  LayoutGrid,
  List,
} from 'lucide-react';
import { t } from '@lingui/core/macro';
import { motion, AnimatePresence } from 'framer-motion';
import { trackServerEvent } from '@qoe/analytics';
import { routes, getArticleUrl } from '@qoe/config/routes';
import { UserAvatar } from '@qoe/ui/ui/UserAvatar';
import { Badge } from '@qoe/ui/badge';
import { Button, buttonClasses } from '@qoe/ui/button';
import { Input, Textarea } from '@qoe/ui/input';
import { Tabs, TabList, Tab } from '@qoe/ui/tabs';
import { TagGroup, TagList, Tag } from '@qoe/ui/tag-group';
import { toast } from '@qoe/ui/toast';
import { toggleBookmarkArticleHomeAction } from '@qoe/sdk/actions/feed';
import { deleteHighlightAction, updateHighlightNoteAction } from '@qoe/sdk/actions/highlights';
import { cn } from '@qoe/utils';
import {
  cleanArticleExcerpt,
  filterBookmarks,
  filterBookmarksByTime,
  calculateTotalReadingMinutes,
  formatQuoteForClipboard,
  filterHighlights,
  filterAnnotations,
  generateHighlightsMarkdown,
  type LibraryTab,
  type ReadingTimeFilter,
} from './library-helpers';

export interface LibraryBookmarkArticle {
  id: string;
  slug: string;
  title: string;
  content: string;
  readingTime: number;
  author: {
    name: string | null;
    username: string | null;
    subdomain: string | null;
    customDomain: string | null;
    logoUrl: string | null;
    type?: 'PERSONAL' | 'MEDIA';
  };
  category: { name: string } | null;
}

export interface LibraryBookmark {
  id: string;
  createdAt: string;
  article: LibraryBookmarkArticle;
}

export interface LibraryHighlight {
  id: string;
  text: string;
  note: string | null;
  createdAt: string;
  isPublic?: boolean;
  upvotesCount?: number;
  article: {
    id: string;
    title: string;
    slug: string;
    publisher: {
      id: string;
      name: string;
      slug: string;
      subdomain: string | null;
      customDomain: string | null;
      type?: 'PERSONAL' | 'MEDIA';
    };
  };
}

export interface HighlightQuota {
  count: number;
  limit: number;
  plus: boolean;
}

interface LibraryClientProps {
  bookmarks?: LibraryBookmark[];
  highlights?: LibraryHighlight[];
  initialBookmarks?: LibraryBookmark[];
  initialHighlights?: LibraryHighlight[];
  initialTab?: LibraryTab;
  highlightQuota?: HighlightQuota;
}

export function LibraryClient({
  bookmarks: propBookmarks,
  highlights: propHighlights,
  initialBookmarks,
  initialHighlights,
  initialTab = 'bookmarks',
  highlightQuota: _highlightQuota,
}: LibraryClientProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingHighlightId, setEditingHighlightId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [timeFilter, setTimeFilter] = useState<ReadingTimeFilter>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // État local optimiste pour les suppressions / mises à jour instantanées
  const [bookmarks, setBookmarks] = useState<LibraryBookmark[]>(
    propBookmarks ?? initialBookmarks ?? []
  );
  const [highlights, setHighlights] = useState<LibraryHighlight[]>(
    propHighlights ?? initialHighlights ?? []
  );
  const [, startTransition] = useTransition();

  const handleTabChange = (tab: LibraryTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    }
  };

  // ── Métriques rapides de lecture ─────────────────────────────────
  const totalReadingMinutes = useMemo(() => {
    return calculateTotalReadingMinutes(bookmarks);
  }, [bookmarks]);

  // ── Filtrage temps réel ──────────────────────────────────────────
  const filteredBookmarks = useMemo(() => {
    const list = filterBookmarks(bookmarks, searchQuery);
    return filterBookmarksByTime(list, timeFilter);
  }, [bookmarks, searchQuery, timeFilter]);

  const filteredHighlights = useMemo(
    () => filterHighlights(highlights, searchQuery),
    [highlights, searchQuery]
  );

  const filteredAnnotations = useMemo(
    () => filterAnnotations(highlights, searchQuery),
    [highlights, searchQuery]
  );

  const annotationsCount = useMemo(
    () => highlights.filter((h) => Boolean(h.note && h.note.trim().length > 0)).length,
    [highlights]
  );

  // ── Actions Signets ──────────────────────────────────────────────
  const handleRemoveBookmark = (bookmark: LibraryBookmark) => {
    const previous = [...bookmarks];
    setBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id));

    startTransition(async () => {
      const res = await toggleBookmarkArticleHomeAction(bookmark.article.id);
      if (!res.ok) {
        setBookmarks(previous);
        toast.error(t`Impossible de retirer le signet`);
        return;
      }
      toast.success(t`Signet retiré`, {
        action: {
          label: t`Annuler`,
          onClick: () => {
            setBookmarks(previous);
            toggleBookmarkArticleHomeAction(bookmark.article.id);
          },
        },
      });
    });
  };

  // ── Actions Surlignages ──────────────────────────────────────────
  const handleCopyHighlight = async (h: LibraryHighlight) => {
    const formatted = formatQuoteForClipboard(h);
    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedId(h.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success(t`Citation copiée`);
    } catch {
      toast.error(t`Erreur lors de la copie`);
    }
  };

  const handleDeleteHighlight = (highlightId: string) => {
    const previous = [...highlights];
    setHighlights((prev) => prev.filter((h) => h.id !== highlightId));

    startTransition(async () => {
      const res = await deleteHighlightAction({ highlightId });
      if (!res.ok) {
        setHighlights(previous);
        toast.error(t`Impossible de supprimer le surlignage`);
        return;
      }
      toast.success(t`Surlignage supprimé`);
    });
  };

  // ── Gestion des annotations / notes ─────────────────────────────
  const handleStartEditNote = (h: LibraryHighlight) => {
    setEditingHighlightId(h.id);
    setNoteInput(h.note || '');
  };

  const handleCancelEditNote = () => {
    setEditingHighlightId(null);
    setNoteInput('');
  };

  const handleSaveNote = (highlightId: string) => {
    const trimmed = noteInput.trim();
    const previous = [...highlights];

    setHighlights((prev) =>
      prev.map((h) => (h.id === highlightId ? { ...h, note: trimmed || null } : h))
    );
    setEditingHighlightId(null);

    startTransition(async () => {
      const res = await updateHighlightNoteAction({
        highlightId,
        note: trimmed || null,
      });
      if (!res.ok) {
        setHighlights(previous);
        toast.error(t`Impossible d'enregistrer l'annotation`);
        return;
      }
      toast.success(trimmed ? t`Annotation enregistrée` : t`Annotation retirée`);
    });
  };

  // ── Export Markdown pour Notion / Obsidian ───────────────────────
  const handleExportMarkdown = () => {
    const md = generateHighlightsMarkdown(highlights);
    if (!md) {
      toast.info(t`Aucun surlignage à exporter`);
      return;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qoe-surlignages-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t`Bibliothèque exportée en Markdown (.md)`);
  };

  const tabs = [
    {
      id: 'bookmarks' as const,
      label: t`Signets`,
      icon: Bookmark,
      count: bookmarks.length,
    },
    {
      id: 'highlights' as const,
      label: t`Surlignages`,
      icon: Highlighter,
      count: highlights.length,
    },
    {
      id: 'annotations' as const,
      label: t`Annotations`,
      icon: PenLine,
      count: annotationsCount,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ─── Header standard unifié ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              {t`Bibliothèque`}
            </h1>
            <Badge tone="brand" variant="soft" size="sm">
              {activeTab === 'bookmarks'
                ? bookmarks.length
                : activeTab === 'highlights'
                  ? highlights.length
                  : annotationsCount}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t`Vos lectures sauvegardées, citations et réflexions personnelles.`}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Mes livres (EPUBs personnels — fiche Plus P1) */}
          <Link
            href={routes.feed.ebooks()}
            className={buttonClasses({ variant: 'outline', size: 'sm' })}
            title={t`Mes livres (EPUBs importés)`}
          >
            <BookOpen className="text-primary" />
            <span>{t`Mes livres`}</span>
          </Link>
          {/* Action Export Markdown */}
          {highlights.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportMarkdown}
              title={t`Exporter au format Markdown (Notion, Obsidian, Bear)`}
            >
              <Download className="text-primary" />
              <span>{t`Exporter (.md)`}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ─── Hero Knowledge Strip (Inspiré de Readwise / Matter) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* KPI 1 : Lectures sauvegardées */}
        <div className="bg-card rounded-xl p-4 border border-border/50 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground block">
              {t`Articles sauvegardés`}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold tracking-tight text-foreground">
                {bookmarks.length}
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                ~{totalReadingMinutes} min {t`estimées`}
              </span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Bookmark className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 2 : Surlignages */}
        <div className="bg-card rounded-xl p-4 border border-border/50 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground block">
              {t`Passages surlignés`}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold tracking-tight text-foreground">
                {highlights.length}
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                {t`citations retenues`}
              </span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Highlighter className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 3 : Annotations */}
        <div className="bg-card rounded-xl p-4 border border-border/50 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground block">
              {t`Réflexions & notes`}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold tracking-tight text-foreground">
                {annotationsCount}
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                {t`pensées consignées`}
              </span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <PenLine className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* ─── Contrôles de navigation : Tabs + Filtres + Recherche ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <Tabs
          variant="segmented"
          size="sm"
          selectedKey={activeTab}
          onSelectionChange={(key) => handleTabChange(key as LibraryTab)}
        >
          <TabList aria-label={t`Sections de la bibliothèque`}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Tab key={tab.id} id={tab.id} count={tab.count}>
                  <Icon />
                  <span>{tab.label}</span>
                </Tab>
              );
            })}
          </TabList>
        </Tabs>

        {/* Filtres de lecture & modes (pour les Signets) */}
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'bookmarks' && (
            <>
              <TagGroup
                aria-label={t`Durée de lecture`}
                selectionMode="single"
                disallowEmptySelection
                size="xs"
                selectedKeys={new Set([timeFilter])}
                onSelectionChange={(keys) => {
                  if (keys !== 'all') {
                    const next = Array.from(keys)[0] as ReadingTimeFilter | undefined;
                    if (next) setTimeFilter(next);
                  }
                }}
              >
                <TagList>
                  <Tag id="all">{t`Tous`}</Tag>
                  <Tag id="quick">&lt; 5 min</Tag>
                  <Tag id="medium">5-15 min</Tag>
                  <Tag id="deep">&gt; 15 min</Tag>
                </TagList>
              </TagGroup>

              <Tabs
                variant="segmented"
                size="xs"
                selectedKey={viewMode}
                onSelectionChange={(key) => setViewMode(key as 'grid' | 'list')}
              >
                <TabList aria-label={t`Mode d’affichage`}>
                  <Tab id="grid" aria-label={t`Vue en grille bento`}>
                    <LayoutGrid />
                  </Tab>
                  <Tab id="list" aria-label={t`Vue en liste haute densité`}>
                    <List />
                  </Tab>
                </TabList>
              </Tabs>
            </>
          )}

          {/* Champ de recherche compact */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-muted-foreground/70 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
            <Input
              type="text"
              size="sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'bookmarks'
                  ? t`Filtrer les signets...`
                  : activeTab === 'highlights'
                    ? t`Rechercher une citation...`
                    : t`Filtrer les notes...`
              }
              className="pl-8 pr-7"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="xs"
                shape="icon"
                onClick={() => setSearchQuery('')}
                aria-label={t`Effacer la recherche`}
                className="absolute right-1 top-1/2 -translate-y-1/2 size-6"
              >
                <X />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB 1: SIGNETS (Compact & Clair)                                */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'bookmarks' && (
        <div>
          {filteredBookmarks.length === 0 ? (
            <div className="bg-muted/20 rounded-xl p-10 border border-border/40 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Bookmark className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-sm text-foreground">
                {searchQuery ? t`Aucun signet trouvé` : t`Aucun signet sauvegardé`}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                {searchQuery
                  ? t`Aucun signet ne correspond à votre recherche « ${searchQuery} ».`
                  : t`Enregistrez des articles en cours de lecture pour les retrouver ici.`}
              </p>
              {!searchQuery && (
                <motion.a
                  href="/home"
                  whileTap={{ scale: 0.98 }}
                  className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90 transition-all mt-1"
                >
                  {t`Découvrir des articles`}
                </motion.a>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            /* Mode Grille Bento */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <AnimatePresence mode="popLayout">
                {filteredBookmarks.map((b) => {
                  const url = getArticleUrl(b.article, { preferTenant: true });

                  return (
                    <motion.div
                      key={b.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.18 }}
                      className="bg-card rounded-xl p-3.5 sm:p-4 border border-border/50 hover:border-primary/40 hover:shadow-xs transition-all duration-200 flex flex-col justify-between gap-2.5 group"
                    >
                      <div>
                        {/* En-tête auteur & temps */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <a
                            href={
                              b.article.author.username
                                ? routes.feed.profile(b.article.author.username)
                                : '#'
                            }
                            className="flex items-center gap-2 min-w-0 group/author"
                          >
                            <UserAvatar
                              user={b.article.author}
                              size="xs"
                              type="MEDIA"
                              shape="squircle"
                            />
                            <span className="text-xs font-semibold text-muted-foreground group-hover/author:text-foreground transition-colors truncate">
                              {b.article.author.name}
                            </span>
                          </a>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                              <Clock className="w-3 h-3 text-primary/80" />
                              <span>{b.article.readingTime} min</span>
                            </span>

                            {/* Bouton de retrait immédiat */}
                            <Button
                              variant="ghost"
                              tone="danger"
                              size="xs"
                              shape="icon"
                              onClick={() => handleRemoveBookmark(b)}
                              aria-label={t`Retirer des signets`}
                            >
                              <BookmarkCheck className="text-primary group-hover:hidden" />
                              <Trash2 className="hidden group-hover:block" />
                            </Button>
                          </div>
                        </div>

                        {/* Titre & Extrait épuré */}
                        <a
                          href={url}
                          target="_blank"
                          data-article-link
                          data-article-slug={b.article.slug}
                          data-article-title={b.article.title}
                          data-article-owner={
                            b.article.author?.username || b.article.author?.subdomain || undefined
                          }
                          onClick={() =>
                            trackServerEvent('library_article_click', {
                              articleId: b.article.id,
                              slug: b.article.slug,
                            })
                          }
                          className="block group/link"
                        >
                          <h2 className="text-sm font-bold text-foreground leading-snug line-clamp-2 group-hover/link:text-primary transition-colors">
                            {b.article.title}
                          </h2>
                          <p className="text-xs text-muted-foreground/90 mt-1 line-clamp-2 leading-relaxed">
                            {cleanArticleExcerpt(b.article.content)}
                          </p>
                        </a>
                      </div>

                      {/* Pied de carte : catégorie & date */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                        <div className="flex items-center gap-2">
                          {b.article.category && (
                            <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/40">
                              {b.article.category.name}
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground/60">
                            {new Date(b.createdAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                        </div>

                        <a
                          href={url}
                          target="_blank"
                          data-article-link
                          data-article-slug={b.article.slug}
                          data-article-title={b.article.title}
                          data-article-owner={
                            b.article.author?.username || b.article.author?.subdomain || undefined
                          }
                          onClick={() =>
                            trackServerEvent('library_article_read', {
                              articleId: b.article.id,
                              slug: b.article.slug,
                            })
                          }
                          className="text-xs font-semibold text-primary inline-flex items-center gap-1 hover:underline group-hover:translate-x-0.5 transition-transform"
                        >
                          <span>{t`Lire`}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            /* Mode Liste Haute Densité (Inspiré de Readwise Reader / Linear) */
            <div className="bg-card rounded-2xl border border-border/50 divide-y divide-border/40 overflow-hidden shadow-2xs">
              <AnimatePresence mode="popLayout">
                {filteredBookmarks.map((b) => {
                  const url = getArticleUrl(b.article, { preferTenant: true });

                  return (
                    <motion.div
                      key={b.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-3 sm:p-3.5 hover:bg-muted/30 transition-colors flex items-center justify-between gap-4 group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <UserAvatar
                          user={b.article.author}
                          size="xs"
                          type="MEDIA"
                          shape="squircle"
                        />
                        <div className="min-w-0 flex-1">
                          <a
                            href={url}
                            target="_blank"
                            data-article-link
                            data-article-slug={b.article.slug}
                            data-article-title={b.article.title}
                            data-article-owner={
                              b.article.author?.username || b.article.author?.subdomain || undefined
                            }
                            className="text-xs sm:text-sm font-bold text-foreground hover:text-primary transition-colors truncate block"
                          >
                            {b.article.title}
                          </a>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span className="font-semibold truncate">{b.article.author.name}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1 shrink-0">
                              <Clock className="w-3 h-3 text-primary/70" />
                              {b.article.readingTime} min
                            </span>
                            {b.article.category && (
                              <>
                                <span>•</span>
                                <span className="text-[11px] font-medium text-muted-foreground/80">
                                  {b.article.category.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-muted-foreground/60 hidden sm:inline-block">
                          {new Date(b.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>

                        <a
                          href={url}
                          target="_blank"
                          data-article-link
                          data-article-slug={b.article.slug}
                          data-article-title={b.article.title}
                          data-article-owner={
                            b.article.author?.username || b.article.author?.subdomain || undefined
                          }
                          className="text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 px-2.5 py-1 rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          <span>{t`Lire`}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>

                        <Button
                          variant="ghost"
                          tone="danger"
                          size="xs"
                          shape="icon"
                          onClick={() => handleRemoveBookmark(b)}
                          aria-label={t`Retirer`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB 2 & 3: SURLIGNAGES OU ANNOTATIONS                           */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {(activeTab === 'highlights' || activeTab === 'annotations') && (
        <div>
          {(activeTab === 'highlights' && filteredHighlights.length === 0) ||
          (activeTab === 'annotations' && filteredAnnotations.length === 0) ? (
            <div className="bg-muted/20 rounded-xl p-10 border border-border/40 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                {activeTab === 'annotations' ? (
                  <PenLine className="w-5 h-5" />
                ) : (
                  <Highlighter className="w-5 h-5" />
                )}
              </div>
              <h3 className="font-semibold text-sm text-foreground">
                {activeTab === 'annotations'
                  ? searchQuery
                    ? t`Aucune annotation trouvée`
                    : t`Aucune annotation rédigée`
                  : searchQuery
                    ? t`Aucune citation trouvée`
                    : t`Aucun surlignage`}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                {activeTab === 'annotations'
                  ? searchQuery
                    ? t`Aucune annotation ne correspond à « ${searchQuery} ».`
                    : t`Ajoutez vos notes et réflexions personnelles sur vos citations pour les retrouver ici.`
                  : searchQuery
                    ? t`Aucune citation ne contient « ${searchQuery} ».`
                    : t`Surlignez des passages stimulants lors de la lecture d'articles.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {(activeTab === 'highlights' ? filteredHighlights : filteredAnnotations).map(
                  (h) => {
                    const isCopied = copiedId === h.id;
                    const isEditing = editingHighlightId === h.id;
                    const url = getArticleUrl(h.article, { preferTenant: true });

                    return (
                      <motion.div
                        key={h.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.18 }}
                        className="bg-card rounded-xl p-3.5 sm:p-4 border border-border/50 hover:border-primary/40 hover:shadow-xs transition-all duration-200 flex flex-col gap-3 group"
                      >
                        {/* Citation surlignée */}
                        <div className="border-l-2 border-primary/70 pl-3 py-0.5">
                          <blockquote className="text-xs sm:text-sm text-foreground leading-relaxed italic">
                            « {h.text} »
                          </blockquote>
                        </div>

                        {/* Origine / Source */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                          <a
                            href={
                              h.article.publisher.slug
                                ? routes.feed.profile(h.article.publisher.slug)
                                : '#'
                            }
                            className="font-semibold hover:text-foreground transition-colors shrink-0 text-foreground/80"
                          >
                            {h.article.publisher.name}
                          </a>
                          <span className="text-muted-foreground/40">•</span>
                          <a
                            href={url}
                            target="_blank"
                            data-article-link
                            data-article-slug={h.article.slug}
                            data-article-title={h.article.title}
                            data-article-owner={
                              h.article.publisher?.slug ||
                              h.article.publisher?.subdomain ||
                              undefined
                            }
                            className="hover:underline hover:text-primary transition-colors truncate"
                          >
                            — {h.article.title}
                          </a>
                        </div>

                        {/* Annotation personnelle */}
                        {h.note && !isEditing && (
                          <div className="bg-muted/40 border border-border/40 rounded-lg p-2.5 flex items-start justify-between gap-2 text-xs">
                            <div className="flex items-start gap-2 min-w-0">
                              <PenLine className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                              <div className="space-y-0.5">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {t`Votre annotation`}
                                </span>
                                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                                  {h.note}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="xs"
                              shape="icon"
                              onClick={() => handleStartEditNote(h)}
                              aria-label={t`Modifier l'annotation`}
                              className="shrink-0"
                            >
                              <Pencil />
                            </Button>
                          </div>
                        )}

                        {/* Éditeur d'annotation en ligne */}
                        {isEditing && (
                          <div className="bg-muted/40 border border-border/50 rounded-lg p-2.5 space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-foreground/80">
                              <span className="flex items-center gap-1.5">
                                <PenLine className="w-3 h-3 text-primary" />
                                <span>{t`Rédiger une annotation`}</span>
                              </span>
                            </div>
                            <Textarea
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                              placeholder={t`Votre réflexion, synthèse ou mémo sur ce passage...`}
                              rows={2}
                              autoFocus
                            />
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="xs" onClick={handleCancelEditNote}>
                                {t`Annuler`}
                              </Button>
                              <Button
                                variant="solid"
                                tone="brand"
                                size="xs"
                                onClick={() => handleSaveNote(h.id)}
                              >
                                {t`Enregistrer`}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Barre d'actions compacte */}
                        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                          <div className="flex items-center gap-1">
                            {!h.note && !isEditing && (
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => handleStartEditNote(h)}
                              >
                                <Plus />
                                <span>{t`Annoter`}</span>
                              </Button>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Copier */}
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleCopyHighlight(h)}
                              title={t`Copier la citation`}
                            >
                              {isCopied ? <Check className="text-success-text" /> : <Copy />}
                              <span>{isCopied ? t`Copié` : t`Copier`}</span>
                            </Button>

                            {/* Citer */}
                            <a
                              href={`/home?quote=${encodeURIComponent(h.text)}&sourceId=${h.article.id}`}
                              className={buttonClasses({ variant: 'ghost', size: 'xs' })}
                              title={t`Citer dans une pensée`}
                            >
                              <MessageSquareQuote />
                              <span>{t`Citer`}</span>
                            </a>

                            {/* Supprimer */}
                            <Button
                              variant="ghost"
                              tone="danger"
                              size="xs"
                              shape="icon"
                              onClick={() => handleDeleteHighlight(h.id)}
                              aria-label={t`Supprimer ce surlignage`}
                            >
                              <Trash2 />
                            </Button>

                            {/* Ouvrir l'article */}
                            <a
                              href={url}
                              target="_blank"
                              className="p-1 text-primary hover:bg-primary/10 rounded-md transition-colors cursor-pointer"
                              title={t`Ouvrir l'article source`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      </motion.div>
                    );
                  }
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
