'use client';

import React, { useState, useMemo, useTransition } from 'react';
import {
  Bookmark,
  BookmarkCheck,
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
import { routes } from '@qoe/config/routes';
import { UserAvatar } from '@qoe/ui/ui/UserAvatar';
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
    publication: {
      id: string;
      name: string;
      slug: string;
      subdomain: string | null;
      customDomain: string | null;
      type?: 'PERSONAL' | 'MEDIA';
    };
  };
}

interface LibraryClientProps {
  bookmarks?: LibraryBookmark[];
  highlights?: LibraryHighlight[];
  initialBookmarks?: LibraryBookmark[];
  initialHighlights?: LibraryHighlight[];
  initialTab?: LibraryTab;
}

export function LibraryClient({
  bookmarks: propBookmarks,
  highlights: propHighlights,
  initialBookmarks,
  initialHighlights,
  initialTab = 'bookmarks',
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

  const getArticleUrl = (article: {
    slug: string;
    author?: { subdomain: string | null; customDomain: string | null };
    publication?: { subdomain: string | null; customDomain: string | null };
  }) => {
    const meta = article.author || article.publication;
    const isProd =
      typeof window !== 'undefined'
        ? window.location.hostname.endsWith('qoe.fi')
        : process.env.NODE_ENV === 'production';
    const suffix = isProd ? 'qoe.fi' : 'localhost';
    const protocol = isProd ? 'https:' : 'http:';
    const host = meta?.customDomain || (meta?.subdomain ? `${meta.subdomain}.${suffix}` : '');
    return host ? `${protocol}//${host}/article/${article.slug}` : `/article/${article.slug}`;
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
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
              {activeTab === 'bookmarks'
                ? bookmarks.length
                : activeTab === 'highlights'
                  ? highlights.length
                  : annotationsCount}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t`Vos lectures sauvegardées, citations et réflexions personnelles.`}
          </p>
        </div>

        {/* Action Export Markdown */}
        {highlights.length > 0 && (
          <button
            type="button"
            onClick={handleExportMarkdown}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-muted/60 hover:bg-muted text-foreground border border-border/50 transition-colors shadow-2xs cursor-pointer self-start sm:self-auto"
            title={t`Exporter au format Markdown (Notion, Obsidian, Bear)`}
          >
            <Download className="w-3.5 h-3.5 text-primary" />
            <span>{t`Exporter (.md)`}</span>
          </button>
        )}
      </div>

      {/* ─── Hero Knowledge Strip (Inspiré de Readwise / Matter) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* KPI 1 : Lectures sauvegardées */}
        <div className="bg-card rounded-xl p-4 border border-border/50 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              {t`Réflexions & Notes`}
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
        {/* Tabs compactes & fluides */}
        <div className="inline-flex items-center p-1 bg-muted/50 border border-border/50 rounded-xl relative">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer select-none',
                  isActive
                    ? 'text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="library-active-tab-indicator"
                    className="absolute inset-0 bg-primary rounded-lg shadow-2xs"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                <Icon className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">{tab.label}</span>
                <span
                  className={cn(
                    'relative z-10 text-[10px] px-1.5 py-0.5 rounded-md font-semibold',
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filtres de lecture & modes (pour les Signets) */}
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'bookmarks' && (
            <>
              {/* Filtres de temps */}
              <div className="inline-flex items-center p-0.5 bg-muted/50 border border-border/50 rounded-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => setTimeFilter('all')}
                  className={cn(
                    'px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer',
                    timeFilter === 'all'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t`Tous`}
                </button>
                <button
                  type="button"
                  onClick={() => setTimeFilter('quick')}
                  className={cn(
                    'px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer',
                    timeFilter === 'quick'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  &lt; 5 min
                </button>
                <button
                  type="button"
                  onClick={() => setTimeFilter('medium')}
                  className={cn(
                    'px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer',
                    timeFilter === 'medium'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  5-15 min
                </button>
                <button
                  type="button"
                  onClick={() => setTimeFilter('deep')}
                  className={cn(
                    'px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer',
                    timeFilter === 'deep'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  &gt; 15 min
                </button>
              </div>

              {/* Mode de vue (Grille vs Liste) */}
              <div className="inline-flex items-center p-0.5 bg-muted/50 border border-border/50 rounded-lg">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'p-1 rounded-md transition-colors cursor-pointer',
                    viewMode === 'grid'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  title={t`Vue en grille bento`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'p-1 rounded-md transition-colors cursor-pointer',
                    viewMode === 'list'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  title={t`Vue en liste haute densité`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          {/* Champ de recherche compact */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-muted-foreground/70 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'bookmarks'
                  ? t`Filtrer les signets...`
                  : activeTab === 'highlights'
                    ? t`Rechercher une citation...`
                    : t`Filtrer les notes...`
              }
              className="w-full bg-muted/40 border border-border/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 rounded-xl pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
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
                  const url = getArticleUrl(b.article);

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
                            <button
                              type="button"
                              onClick={() => handleRemoveBookmark(b)}
                              className="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer"
                              title={t`Retirer des signets`}
                            >
                              <BookmarkCheck className="w-3.5 h-3.5 text-primary group-hover:hidden" />
                              <Trash2 className="w-3.5 h-3.5 text-destructive hidden group-hover:block" />
                            </button>
                          </div>
                        </div>

                        {/* Titre & Extrait épuré */}
                        <a
                          href={url}
                          target="_blank"
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
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/40">
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
                  const url = getArticleUrl(b.article);

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
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground/80">
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
                          className="text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 px-2.5 py-1 rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          <span>{t`Lire`}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>

                        <button
                          type="button"
                          onClick={() => handleRemoveBookmark(b)}
                          className="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer"
                          title={t`Retirer`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
                    const url = getArticleUrl(h.article);

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
                              h.article.publication.slug
                                ? routes.feed.profile(h.article.publication.slug)
                                : '#'
                            }
                            className="font-semibold hover:text-foreground transition-colors shrink-0 text-foreground/80"
                          >
                            {h.article.publication.name}
                          </a>
                          <span className="text-muted-foreground/40">•</span>
                          <a
                            href={url}
                            target="_blank"
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
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  {t`Votre annotation`}
                                </span>
                                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                                  {h.note}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleStartEditNote(h)}
                              className="p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer shrink-0"
                              title={t`Modifier l'annotation`}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
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
                            <textarea
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                              placeholder={t`Votre réflexion, synthèse ou mémo sur ce passage...`}
                              rows={2}
                              className="w-full text-xs p-2 rounded-md bg-card border border-border/60 focus:ring-1 focus:ring-primary/30 focus:border-primary/40 focus:outline-hidden resize-none text-foreground placeholder:text-muted-foreground/60"
                              autoFocus
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={handleCancelEditNote}
                                className="text-xs px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                              >
                                {t`Annuler`}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveNote(h.id)}
                                className="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-2xs"
                              >
                                {t`Enregistrer`}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Barre d'actions compacte */}
                        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                          <div className="flex items-center gap-1">
                            {!h.note && !isEditing && (
                              <button
                                type="button"
                                onClick={() => handleStartEditNote(h)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>{t`Annoter`}</span>
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Copier */}
                            <button
                              type="button"
                              onClick={() => handleCopyHighlight(h)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                              title={t`Copier la citation`}
                            >
                              {isCopied ? (
                                <Check className="w-3 h-3 text-success" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{isCopied ? t`Copié` : t`Copier`}</span>
                            </button>

                            {/* Citer */}
                            <a
                              href={`/home?quote=${encodeURIComponent(h.text)}&sourceId=${h.article.id}`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                              title={t`Citer dans une pensée`}
                            >
                              <MessageSquareQuote className="w-3 h-3" />
                              <span>{t`Citer`}</span>
                            </a>

                            {/* Supprimer */}
                            <button
                              type="button"
                              onClick={() => handleDeleteHighlight(h.id)}
                              className="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer"
                              title={t`Supprimer ce surlignage`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

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
