'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  FileText,
  Eye,
  MessageSquare,
  BarChart3,
  Search,
  AlertCircle,
  Tag,
  ArrowUpDown,
  FilterX,
  Lock,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import {
  deleteArticleAction,
  saveCategoryAction,
  deleteCategoryAction,
} from '@qoe/api-client/actions/articles';

import { ArticleInspectorModal } from '../analytics/components/ArticleInspectorModal';

interface ArticleWithCategory {
  id: string;
  title: string;
  slug: string;
  content: string;
  published: boolean;
  isPremium: boolean;
  readingTime: number;
  categoryId: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  _count?: {
    bookmarks: number;
    highlights: number;
    letters: number;
  };
}

interface CategoryWithCount {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  _count: {
    articles: number;
  };
}

interface ArticlesClientProps {
  initialArticles: ArticleWithCategory[];
  initialCategories: CategoryWithCount[];
}

type SortField = 'updatedAt' | 'createdAt' | 'title' | 'readingTime';
type SortDirection = 'desc' | 'asc';
type AccessFilter = 'all' | 'free' | 'premium';

export function ArticlesClient({ initialArticles, initialCategories }: ArticlesClientProps) {
  const [activeMainTab, setActiveMainTab] = useState<'articles' | 'categories'>('articles');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [articles, setArticles] = useState<ArticleWithCategory[]>(initialArticles);
  const [categories, setCategories] = useState<CategoryWithCount[]>(initialCategories);

  // Search & Advanced Sorting & Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');

  // Article Inspector Modal State
  const [inspectingArticle, setInspectingArticle] = useState<{ id: string; slug: string } | null>(
    null
  );

  // Category Form State
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [, setCategorySuccess] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Automatic category slug helper
  const handleCategoryNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewCatName(val);
    setNewCatSlug(
      val
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
    );
  };

  // Handle category submission
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      setCategoryError(null);
      setCategorySuccess(false);
      setIsCreatingCategory(true);

      const res = await saveCategoryAction({
        name: newCatName,
        slug: newCatSlug || undefined,
        description: newCatDesc || null,
      });

      if (!res.ok) throw new Error(res.error.message);
      if (!res.data) throw new Error('Échec de création de la catégorie.');
      const created = res.data;

      const newCatWithCount: CategoryWithCount = {
        id: created.id,
        name: created.name,
        slug: created.slug,
        description: created.description,
        _count: { articles: 0 },
      };

      setCategories((prev) =>
        [...prev, newCatWithCount].sort((a, b) => a.name.localeCompare(b.name))
      );

      setNewCatName('');
      setNewCatSlug('');
      setNewCatDesc('');
      setCategorySuccess(true);
      setTimeout(() => setCategorySuccess(false), 3000);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Une erreur est survenue lors de la création du thème.';
      setCategoryError(message);
    } finally {
      setIsCreatingCategory(false);
    }
  };

  // Handle category deletion
  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le thème "${name}" ?`)) {
      return;
    }

    try {
      await deleteCategoryAction(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setArticles((prev) =>
        prev.map((art) =>
          art.categoryId === id ? { ...art, categoryId: null, category: null } : art
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Échec de la suppression.';
      alert(message);
    }
  };

  // Handle article deletion
  const handleDeleteArticle = async (id: string, title: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer l'écrit "${title}" ?`)) {
      return;
    }

    try {
      await deleteArticleAction(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Échec de la suppression.';
      alert(message);
    }
  };

  // Reset all advanced filters
  const resetFilters = () => {
    setSearchTerm('');
    setSortField('updatedAt');
    setSortDirection('desc');
    setSelectedCategory('all');
    setAccessFilter('all');
    setStatusFilter('all');
  };

  const hasActiveFilters =
    searchTerm !== '' ||
    sortField !== 'updatedAt' ||
    sortDirection !== 'desc' ||
    selectedCategory !== 'all' ||
    accessFilter !== 'all' ||
    statusFilter !== 'all';

  // Precise Filtering & Sorting Logic
  const filteredAndSortedArticles = articles
    .filter((art) => {
      // 1. Search term match
      const matchesSearch =
        art.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        art.slug.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // 2. Status filter
      if (statusFilter === 'published' && !art.published) return false;
      if (statusFilter === 'draft' && art.published) return false;

      // 3. Category filter
      if (selectedCategory !== 'all' && art.categoryId !== selectedCategory) return false;

      // 4. Access filter
      if (accessFilter === 'free' && art.isPremium) return false;
      if (accessFilter === 'premium' && !art.isPremium) return false;

      return true;
    })
    .sort((a, b) => {
      let comparison = 0;

      if (sortField === 'updatedAt') {
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (sortField === 'createdAt') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === 'readingTime') {
        comparison = (a.readingTime || 1) - (b.readingTime || 1);
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });

  const countPublished = articles.filter((a) => a.published).length;
  const countDrafts = articles.filter((a) => !a.published).length;

  return (
    <div className="space-y-6 w-full pb-24 text-foreground font-sans selection:bg-primary/20 selection:text-primary">
      {/* Main Stage Headline */}
      <section className="pt-4 md:pt-2 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-foreground font-sans">Articles</h2>

          {/* Tab Switcher: Articles vs Thèmes */}
          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border/30 text-xs font-semibold">
            <button
              onClick={() => setActiveMainTab('articles')}
              className={cn(
                'px-3 py-1 rounded-md transition-all cursor-pointer font-sans',
                activeMainTab === 'articles'
                  ? 'bg-card text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Écrits ({articles.length})
            </button>
            <button
              onClick={() => setActiveMainTab('categories')}
              className={cn(
                'px-3 py-1 rounded-md transition-all cursor-pointer font-sans',
                activeMainTab === 'categories'
                  ? 'bg-card text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Thèmes ({categories.length})
            </button>
          </div>
        </div>
      </section>

      {/* Main Content View */}
      <AnimatePresence mode="wait">
        {activeMainTab === 'articles' ? (
          <motion.div
            key="articles-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {/* Restored Original Search Bar */}
            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 stroke-[1.5]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher un écrit..."
                className="w-full bg-card border border-border/40 rounded-full py-2 pl-9.5 pr-4 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-sans"
              />
            </div>

            {/* Ultra-Clean Hairline Sub-Toolbar (Dub & Apple Music Web Styled) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/30 font-sans text-xs">
              {/* Left Side: Status Filter Tabs */}
              <div className="flex items-center gap-5 text-sm font-medium">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={cn(
                    'pb-2 -mb-3 border-b-2 transition-all cursor-pointer text-xs font-sans',
                    statusFilter === 'all'
                      ? 'border-primary text-primary font-bold'
                      : 'border-transparent text-muted-foreground hover:text-foreground font-medium'
                  )}
                >
                  Tous ({articles.length})
                </button>
                <button
                  onClick={() => setStatusFilter('published')}
                  className={cn(
                    'pb-2 -mb-3 border-b-2 transition-all cursor-pointer text-xs font-sans',
                    statusFilter === 'published'
                      ? 'border-primary text-primary font-bold'
                      : 'border-transparent text-muted-foreground hover:text-foreground font-medium'
                  )}
                >
                  Publiés ({countPublished})
                </button>
                <button
                  onClick={() => setStatusFilter('draft')}
                  className={cn(
                    'pb-2 -mb-3 border-b-2 transition-all cursor-pointer text-xs font-sans',
                    statusFilter === 'draft'
                      ? 'border-primary text-primary font-bold'
                      : 'border-transparent text-muted-foreground hover:text-foreground font-medium'
                  )}
                >
                  Brouillons ({countDrafts})
                </button>
              </div>

              {/* Right Side: Sleek Hairline Select Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Hairline Category Dropdown */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-background border border-border/30 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:border-border/60 transition-colors cursor-pointer font-sans"
                >
                  <option value="all">Tous les thèmes</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat._count.articles})
                    </option>
                  ))}
                </select>

                {/* Hairline Access Level Dropdown */}
                <select
                  value={accessFilter}
                  onChange={(e) => setAccessFilter(e.target.value as AccessFilter)}
                  className="bg-background border border-border/30 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:border-border/60 transition-colors cursor-pointer font-sans"
                >
                  <option value="all">Tous les accès</option>
                  <option value="free">Gratuits</option>
                  <option value="premium">Premium Paywall</option>
                </select>

                <div className="h-4 w-[1px] bg-border/30 hidden sm:block" />

                {/* Hairline Sort Field Dropdown */}
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="bg-background border border-border/30 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:border-border/60 transition-colors cursor-pointer font-sans"
                >
                  <option value="updatedAt">Trier par : Récents</option>
                  <option value="createdAt">Trier par : Création</option>
                  <option value="title">Trier par : Titre (A-Z)</option>
                  <option value="readingTime">Trier par : Durée</option>
                </select>

                {/* Hairline Sort Direction Toggle */}
                <button
                  onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-background border border-border/30 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-sans"
                  title={`Ordre : ${sortDirection === 'desc' ? 'Décroissant' : 'Croissant'}`}
                >
                  <ArrowUpDown className="w-3 h-3 stroke-[1.5]" />
                  <span className="uppercase text-[10px] font-bold">{sortDirection}</span>
                </button>

                {/* Hairline Active Filter Reset Button */}
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors cursor-pointer font-sans"
                    title="Réinitialiser tous les filtres"
                  >
                    <FilterX className="w-3 h-3" />
                    <span>Effacer</span>
                  </button>
                )}
              </div>
            </div>

            {/* Article List Section */}
            {filteredAndSortedArticles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 font-sans border border-dashed border-border/60 rounded-xl">
                <BookOpen className="h-8 w-8 text-muted-foreground/40 stroke-[1.5]" />
                <div className="space-y-0.5">
                  <h3 className="text-foreground font-semibold text-sm">
                    Aucun écrit ne correspond
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-xs font-sans">
                    {hasActiveFilters
                      ? 'Essayez de modifier vos critères de recherche ou de tri.'
                      : 'Prenez la plume pour donner corps à vos pensées.'}
                  </p>
                </div>
                {hasActiveFilters ? (
                  <button
                    onClick={resetFilters}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-muted text-foreground font-semibold text-xs rounded-xl hover:bg-muted/80 transition-colors cursor-pointer"
                  >
                    <FilterX className="w-3.5 h-3.5" />
                    <span>Réinitialiser les filtres</span>
                  </button>
                ) : (
                  <a
                    href="/articles/new"
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Rédiger un article</span>
                  </a>
                )}
              </div>
            ) : (
              <section className="flex flex-col divide-y divide-border/30">
                {filteredAndSortedArticles.map((art) => {
                  const interactionsCount =
                    (art._count?.bookmarks || 0) +
                    (art._count?.highlights || 0) +
                    (art._count?.letters || 0);

                  return (
                    <div
                      key={art.id}
                      className="flex items-center gap-4 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer group px-3 rounded-lg border-b border-border/30"
                    >
                      {/* Square Icon Block */}
                      <div className="w-8 h-8 rounded bg-muted/50 flex items-center justify-center shrink-0">
                        {art.isPremium ? (
                          <Lock className="w-4 h-4 text-highlight stroke-[1.5]" />
                        ) : (
                          <FileText className="w-4 h-4 text-muted-foreground stroke-[1.5]" />
                        )}
                      </div>

                      {/* Title & Metadata */}
                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <a
                          href={`/articles/${art.id}`}
                          className="text-sm text-foreground font-medium truncate group-hover:text-primary transition-colors font-sans flex-1"
                        >
                          {art.title}
                        </a>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Category Tag */}
                          {art.category && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/30">
                              {art.category.name}
                            </span>
                          )}

                          {/* Premium Badge */}
                          {art.isPremium && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-highlight/10 text-highlight border border-highlight/20">
                              Premium
                            </span>
                          )}

                          {/* Published Status Badge */}
                          <span
                            className={cn(
                              'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium font-sans',
                              art.published
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground border border-border/30'
                            )}
                          >
                            {art.published ? 'Publié' : 'Brouillon'}
                          </span>

                          <span className="text-xs text-muted-foreground font-sans">
                            {new Date(art.updatedAt).toLocaleDateString('fr-FR', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Metrics (Real Views & Real Reader Interactions) -> Click opens Analytics Inspector */}
                      <div className="hidden md:flex items-center gap-5 px-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectingArticle({ id: art.id, slug: art.slug });
                          }}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer p-1 rounded hover:bg-muted/60"
                          title="Inspecter les statistiques réelles de cet article"
                        >
                          <Eye className="w-3.5 h-3.5 stroke-[1.5]" />
                          <span>Vues</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectingArticle({ id: art.id, slug: art.slug });
                          }}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer p-1 rounded hover:bg-muted/60"
                          title="Voir les réactions & surlignages des lecteurs"
                        >
                          <MessageSquare className="w-3.5 h-3.5 stroke-[1.5]" />
                          <span>{interactionsCount}</span>
                        </button>
                      </div>

                      {/* Direct Action Controls */}
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectingArticle({ id: art.id, slug: art.slug });
                          }}
                          className="p-1.5 text-muted-foreground hover:text-primary rounded hover:bg-muted transition-colors cursor-pointer"
                          title="Analyses de l'article"
                        >
                          <BarChart3 className="w-4 h-4 stroke-[1.5]" />
                        </button>

                        <a
                          href={`/articles/${art.id}`}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
                          title="Éditer"
                        >
                          <Edit3 className="w-4 h-4 stroke-[1.5]" />
                        </a>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteArticle(art.id, art.title);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4 stroke-[1.5]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
          </motion.div>
        ) : (
          /* Categories / Thèmes View */
          <motion.div
            key="categories-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-2"
          >
            {/* Left: Themes list */}
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans">
                Thèmes existants
              </h3>

              {categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-2 font-sans border border-dashed border-border/60 rounded-xl">
                  <Tag className="h-6 w-6 text-muted-foreground/60 stroke-[1.5]" />
                  <p className="text-xs text-muted-foreground max-w-xs font-sans">
                    Aucun thème créé pour le moment.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/30 border-t border-b border-border/30">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="py-4 flex items-center justify-between gap-6 transition-all hover:bg-muted/30 px-2 rounded-lg"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground font-sans">
                            {cat.name}
                          </h4>
                          <span className="text-[11px] text-muted-foreground font-sans font-medium">
                            ({cat._count.articles}{' '}
                            {cat._count.articles > 1 ? 'articles' : 'article'})
                          </span>
                        </div>
                        {cat.description && (
                          <p className="text-xs text-muted-foreground font-sans leading-relaxed">
                            {cat.description}
                          </p>
                        )}
                        <div className="text-[10px] font-mono text-muted-foreground/80">
                          /{cat.slug}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors cursor-pointer"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Create Theme Form */}
            <div className="md:col-span-1">
              <div className="bg-card border border-border/40 rounded-xl p-5 space-y-4 shadow-none">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans">
                    Nouveau Thème
                  </h3>
                  <p className="text-muted-foreground text-xs leading-normal font-sans">
                    Organisez vos écrits par sujets.
                  </p>
                </div>

                <form onSubmit={handleCreateCategory} className="space-y-4 font-sans">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-sans font-semibold">
                      Nom du thème
                    </label>
                    <input
                      type="text"
                      value={newCatName}
                      onChange={handleCategoryNameChange}
                      placeholder="Ex: Poésie, Tech..."
                      required
                      className="w-full bg-background border border-border/40 rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-primary transition-colors font-sans"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-sans font-semibold">
                      Slug URL
                    </label>
                    <input
                      type="text"
                      value={newCatSlug}
                      onChange={(e) =>
                        setNewCatSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
                      }
                      placeholder="Ex: poesie"
                      required
                      className="w-full bg-background border border-border/40 rounded-lg p-2 text-xs font-mono text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-sans font-semibold">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={newCatDesc}
                      onChange={(e) => setNewCatDesc(e.target.value)}
                      placeholder="Courte description..."
                      className="w-full bg-background border border-border/40 rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-primary transition-colors font-sans resize-none"
                    />
                  </div>

                  {categoryError && (
                    <div className="bg-destructive/10 border border-destructive/20 text-destructive p-2.5 rounded-lg text-[11px] flex gap-2 font-sans">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{categoryError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isCreatingCategory || !newCatName.trim()}
                    className="w-full h-8 flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-sans font-bold text-xs rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {isCreatingCategory ? 'Création...' : 'Ajouter le thème'}
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Article Inspector Drawer Modal */}
      {inspectingArticle && (
        <ArticleInspectorModal
          urlPath={`/article/${inspectingArticle.slug}`}
          articleId={inspectingArticle.id}
          onClose={() => setInspectingArticle(null)}
          onEdit={() => {
            window.location.href = `/articles/${inspectingArticle.id}`;
          }}
        />
      )}
    </div>
  );
}
