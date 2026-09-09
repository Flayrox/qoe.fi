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
} from 'lucide-react';
import { t } from '@lingui/core/macro';
import { motion, AnimatePresence } from 'framer-motion';
import { trackServerEvent } from '@qoe/analytics';
import { ReaderPageLayout } from '@/components/layout/ReaderPageLayout';
import { routes } from '@qoe/config/routes';
import { UserAvatar } from '@qoe/ui/ui/UserAvatar';
import { toast } from '@qoe/ui/toast';
import { toggleBookmarkArticleHomeAction } from '@qoe/sdk/actions/feed';
import { deleteHighlightAction, updateHighlightNoteAction } from '@qoe/sdk/actions/highlights';
import { cn } from '@qoe/utils';
import {
  cleanArticleExcerpt,
  filterBookmarks,
  filterHighlights,
  filterAnnotations,
  generateHighlightsMarkdown,
  type LibraryTab,
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
  isPublic: boolean;
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
  bookmarks: LibraryBookmark[];
  highlights: LibraryHighlight[];
  initialTab?: LibraryTab;
}

export function LibraryClient({
  bookmarks: initialBookmarks,
  highlights: initialHighlights,
  initialTab = 'bookmarks',
}: LibraryClientProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Édition en ligne des notes / annotations
  const [editingHighlightId, setEditingHighlightId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  // État local optimiste pour les suppressions / mises à jour instantanées
  const [bookmarks, setBookmarks] = useState<LibraryBookmark[]>(initialBookmarks);
  const [highlights, setHighlights] = useState<LibraryHighlight[]>(initialHighlights);
  const [, startTransition] = useTransition();

  const handleTabChange = (tab: LibraryTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    }
  };

  // ── Filtrage temps réel ──────────────────────────────────────────
  const filteredBookmarks = useMemo(
    () => filterBookmarks(bookmarks, searchQuery),
    [bookmarks, searchQuery]
  );

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
    const formatted = `« ${h.text} »\n— ${h.article.publication.name}, dans "${h.article.title}"\nhttps://qoe.fi/article/${h.article.slug}`;
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
    <ReaderPageLayout giantTitle={t`Bibliothèque`}>
      <div className="bg-card text-card-foreground shadow-xl border-t border-x border-border/40 rounded-t-2xl min-h-screen mt-20 relative z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-16 space-y-6">
          {/* Header épuré */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-5">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <span>{t`Bibliothèque`}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                  {activeTab === 'bookmarks'
                    ? bookmarks.length
                    : activeTab === 'highlights'
                      ? highlights.length
                      : annotationsCount}
                </span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t`Vos lectures sauvegardées, citations et réflexions personnelles.`}
              </p>
            </div>

            {/* Export Markdown */}
            {highlights.length > 0 && (
              <button
                type="button"
                onClick={handleExportMarkdown}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-foreground border border-border/50 transition-colors shadow-2xs cursor-pointer self-start sm:self-auto"
                title={t`Exporter au format Markdown (Notion, Obsidian, Bear)`}
              >
                <Download className="w-3.5 h-3.5 text-primary" />
                <span>{t`Exporter (.md)`}</span>
              </button>
            )}
          </div>

          {/* Contrôles de navigation : Tabs + Recherche */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

            {/* Champ de recherche compact */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-muted-foreground/70 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === 'bookmarks'
                    ? t`Filtrer les signets...`
                    : activeTab === 'highlights'
                      ? t`Filtrer les citations...`
                      : t`Filtrer les annotations...`
                }
                className="w-full pl-8 pr-7 py-1.5 bg-muted/30 border border-border/50 rounded-lg text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-1 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-md"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
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
              ) : (
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

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                                  <Clock className="w-3 h-3" />
                                  <span>{t`${b.article.readingTime} min`}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleRemoveBookmark(b);
                                  }}
                                  title={t`Retirer des signets`}
                                  className="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer"
                                >
                                  <BookmarkCheck className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Titre */}
                            <a href={url} target="_blank" className="block group/title">
                              <h3 className="text-sm font-semibold text-foreground leading-snug group-hover/title:text-primary transition-colors line-clamp-2 mb-1.5">
                                {b.article.title}
                              </h3>
                            </a>

                            {/* Extrait concis */}
                            <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
                              {cleanArticleExcerpt(b.article.content, 140)}
                            </p>
                          </div>

                          {/* Pied de carte */}
                          <div className="flex items-center justify-between pt-2.5 border-t border-border/40 text-xs">
                            <div className="flex items-center gap-2">
                              {b.article.category && (
                                <span className="text-[10px] font-medium px-2 py-0.5 bg-muted rounded-md text-muted-foreground">
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
                    {(activeTab === 'annotations' ? filteredAnnotations : filteredHighlights).map(
                      (h) => {
                        const url = getArticleUrl(h.article);
                        const isCopied = copiedId === h.id;
                        const isEditing = editingHighlightId === h.id;

                        return (
                          <motion.div
                            key={h.id}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ duration: 0.18 }}
                            className="bg-card rounded-xl p-3.5 sm:p-4 border border-border/50 hover:border-primary/40 hover:shadow-xs transition-all duration-200 space-y-2.5 group"
                          >
                            {/* Citation compacte */}
                            <div className="border-l-2 border-primary/80 pl-3 py-0.5">
                              <p className="text-xs sm:text-sm font-medium text-foreground leading-relaxed select-text">
                                « {h.text} »
                              </p>
                            </div>

                            {/* Source article */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <UserAvatar
                                user={h.article.publication}
                                size="xs"
                                type="MEDIA"
                                shape="squircle"
                              />
                              <a
                                href={url}
                                target="_blank"
                                className="truncate hover:text-foreground transition-colors"
                              >
                                <span className="font-semibold text-foreground/90">
                                  {h.article.publication.name}
                                </span>{' '}
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
      </div>
    </ReaderPageLayout>
  );
}
