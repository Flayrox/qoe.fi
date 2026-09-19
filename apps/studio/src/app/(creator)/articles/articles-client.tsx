'use client';

import React, { useState, useMemo } from 'react';
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
  CheckCircle2,
  XCircle,
  Clock,
  GripVertical,
  FolderOpen,
  FolderTree,
  CornerDownRight,
  ArrowUpRight,
  ChevronDown,
  Layers,
  X,
  Move,
  FolderInput,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import {
  deleteArticleAction,
  saveCategoryAction,
  deleteCategoryAction,
  reviewArticleAction,
  getArticlesAction,
  moveCategoryAction,
} from '@qoe/sdk/actions/articles';
import { t } from '@lingui/core/macro';

import { ArticleInspectorModal } from '../analytics/components/ArticleInspectorModal';

interface ArticleWithCategory {
  id: string;
  title: string;
  slug: string;
  content: string;
  published: boolean;
  status?: string;
  isPremium: boolean;
  readingTime: number;
  categoryId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
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
  views?: number;
  viewsUnique?: number;
  commentsCount?: number;
}

interface CategoryWithCount {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  _count: {
    articles: number;
  };
}

interface ArticlesClientProps {
  initialArticles: ArticleWithCategory[];
  initialCategories: CategoryWithCount[];
  canReview?: boolean;
}

type SortField = 'updatedAt' | 'createdAt' | 'title' | 'readingTime';
type SortDirection = 'desc' | 'asc';
type AccessFilter = 'all' | 'free' | 'premium';
type StatusFilter = 'all' | 'published' | 'draft' | 'review';

export function ArticlesClient({
  initialArticles,
  initialCategories,
  canReview = false,
}: ArticlesClientProps) {
  const [activeMainTab, setActiveMainTab] = useState<'articles' | 'categories'>('articles');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [articles, setArticles] = useState<ArticleWithCategory[]>(initialArticles);
  const [categories, setCategories] = useState<CategoryWithCount[]>(initialCategories);

  // Search & Advanced Sorting & Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');

  // Vues period (ReadingSession) — 7j/30j/90j/all ; défaut 30j
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [isLoadingViews, setIsLoadingViews] = useState(false);

  // Refetch Vues quand period change (30j initial déjà chargé côté serveur)
  React.useEffect(() => {
    let cancelled = false;
    setIsLoadingViews(true);
    getArticlesAction(period)
      .then((res) => {
        if (!cancelled && res.ok && res.data) {
          setArticles(res.data as unknown as ArticleWithCategory[]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingViews(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  // Article Inspector Modal State
  const [inspectingArticle, setInspectingArticle] = useState<{ id: string; slug: string } | null>(
    null
  );

  // Category Form State (Création)
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatParentId, setNewCatParentId] = useState<string>('');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [, setCategorySuccess] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Category Edit State (Modal d'édition)
  const [editingCat, setEditingCat] = useState<CategoryWithCount | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatSlug, setEditCatSlug] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');
  const [editCatParentId, setEditCatParentId] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Drag & Drop State (Déplacement à la souris et Pointer Events)
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOverParentId, setDragOverParentId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const activeDragRef = React.useRef<{
    id: string;
    startX: number;
    startY: number;
    isDragging: boolean;
    currentTargetParentId: string | null;
    isOverRoot: boolean;
  } | null>(null);

  // Inline Category Creation State (Création directe ultra-rapide)
  const [inlineCreatingParentId, setInlineCreatingParentId] = useState<string | null>(null);
  const [inlineSubName, setInlineSubName] = useState('');
  const [isCreatingInlineRoot, setIsCreatingInlineRoot] = useState(false);
  const [inlineRootName, setInlineRootName] = useState('');
  const [isCreatingInline, setIsCreatingInline] = useState(false);

  // Quick Move Menu State (Déplacement instantané en 1 clic)
  const [movingCatId, setMovingCatId] = useState<string | null>(null);

  // Catégories mères et enfants helpers
  const rootCategories = useMemo(() => categories.filter((c) => !c.parentId), [categories]);
  const draggedCat = useMemo(
    () => categories.find((c) => c.id === draggedId),
    [categories, draggedId]
  );
  const hasChildren = (id: string) => categories.some((c) => c.parentId === id);

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

  // Pointer-based Drag & Drop handlers (ultra fiable, zéro annulation navigateur sur Mac/Trackpad)
  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    // Si l'utilisateur clique sur un élément interactif, ne pas démarrer de drag
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a')) {
      return;
    }
    if (e.button !== 0) return; // Seulement clic gauche

    activeDragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
      currentTargetParentId: null,
      isOverRoot: false,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!activeDragRef.current) return;
      const dx = moveEvent.clientX - activeDragRef.current.startX;
      const dy = moveEvent.clientY - activeDragRef.current.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!activeDragRef.current.isDragging && dist > 5) {
        activeDragRef.current.isDragging = true;
        setDraggedId(activeDragRef.current.id);
      }

      if (activeDragRef.current.isDragging) {
        setPointerPos({ x: moveEvent.clientX, y: moveEvent.clientY });

        const element = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        if (element) {
          const rootZone = element.closest('[data-drop-zone="root"]');
          if (rootZone) {
            activeDragRef.current.isOverRoot = true;
            activeDragRef.current.currentTargetParentId = null;
            setDragOverRoot(true);
            setDragOverParentId(null);
            return;
          }

          const catZone = element.closest('[data-category-drop-id]');
          if (catZone) {
            const targetId = catZone.getAttribute('data-category-drop-id');
            if (targetId && targetId !== activeDragRef.current.id) {
              activeDragRef.current.currentTargetParentId = targetId;
              activeDragRef.current.isOverRoot = false;
              setDragOverParentId(targetId);
              setDragOverRoot(false);
              return;
            }
          }
        }

        activeDragRef.current.currentTargetParentId = null;
        activeDragRef.current.isOverRoot = false;
        setDragOverParentId(null);
        setDragOverRoot(false);
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      const dragInfo = activeDragRef.current;
      activeDragRef.current = null;

      if (dragInfo && dragInfo.isDragging) {
        const id = dragInfo.id;
        const targetParentId = dragInfo.currentTargetParentId;
        const isRoot = dragInfo.isOverRoot;

        setDraggedId(null);
        setPointerPos(null);
        setDragOverParentId(null);
        setDragOverRoot(false);

        if (targetParentId) {
          handleDropOnParent(targetParentId, id);
        } else if (isRoot) {
          handleDropOnRoot(id);
        }
      } else {
        setDraggedId(null);
        setPointerPos(null);
        setDragOverParentId(null);
        setDragOverRoot(false);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const handleDragEnd = () => {
    activeDragRef.current = null;
    setDraggedId(null);
    setPointerPos(null);
    setDragOverParentId(null);
    setDragOverRoot(false);
  };

  const handleDropOnParent = async (targetParentId: string, customId?: string) => {
    const idToMove = customId || draggedId;
    if (!idToMove || idToMove === targetParentId) {
      handleDragEnd();
      return;
    }
    const dragged = categories.find((c) => c.id === idToMove);
    if (!dragged) {
      handleDragEnd();
      return;
    }

    if (hasChildren(idToMove)) {
      alert(
        t`Cette catégorie contient déjà des sous-catégories et ne peut pas devenir une sous-catégorie.`
      );
      handleDragEnd();
      return;
    }

    if (dragged.parentId === targetParentId) {
      handleDragEnd();
      return;
    }

    const previousCategories = [...categories];
    // Mise à jour optimiste instantanée
    setCategories((prev) =>
      prev.map((c) => (c.id === idToMove ? { ...c, parentId: targetParentId } : c))
    );
    handleDragEnd();

    try {
      const res = await moveCategoryAction({ id: idToMove, parentId: targetParentId });
      if (!res.ok) throw new Error(res.error.message);
    } catch (err: unknown) {
      setCategories(previousCategories);
      alert(err instanceof Error ? err.message : t`Échec du déplacement de la catégorie.`);
    }
  };

  const handleDropOnRoot = async (customId?: string) => {
    const idToMove = customId || draggedId;
    if (!idToMove) {
      handleDragEnd();
      return;
    }
    const dragged = categories.find((c) => c.id === idToMove);
    if (!dragged || !dragged.parentId) {
      handleDragEnd();
      return;
    }

    const previousCategories = [...categories];
    setCategories((prev) => prev.map((c) => (c.id === idToMove ? { ...c, parentId: null } : c)));
    handleDragEnd();

    try {
      const res = await moveCategoryAction({ id: idToMove, parentId: null });
      if (!res.ok) throw new Error(res.error.message);
    } catch (err: unknown) {
      setCategories(previousCategories);
      alert(err instanceof Error ? err.message : t`Échec du détachement de la catégorie.`);
    }
  };

  // Handlers pour création inline ultra simple
  const handleInlineCreateSubCategory = async (parentId: string) => {
    const name = inlineSubName.trim();
    if (!name || isCreatingInline) return;

    try {
      setIsCreatingInline(true);
      const slug =
        name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-') || `cat-${Date.now()}`;

      const res = await saveCategoryAction({
        name,
        slug,
        parentId,
      });

      if (!res.ok || !res.data) {
        throw new Error(res.ok ? t`Échec de création` : res.error.message);
      }

      const created = res.data;
      setCategories((prev) => [
        ...prev,
        {
          id: created.id,
          name: created.name,
          slug: created.slug,
          description: null,
          parentId,
          _count: { articles: 0 },
        },
      ]);
      setInlineCreatingParentId(null);
      setInlineSubName('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t`Échec de la création de la sous-catégorie.`);
    } finally {
      setIsCreatingInline(false);
    }
  };

  const handleInlineCreateRoot = async () => {
    const name = inlineRootName.trim();
    if (!name || isCreatingInline) return;

    try {
      setIsCreatingInline(true);
      const slug =
        name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-') || `cat-${Date.now()}`;

      const res = await saveCategoryAction({
        name,
        slug,
        parentId: null,
      });

      if (!res.ok || !res.data) {
        throw new Error(res.ok ? t`Échec de création` : res.error.message);
      }

      const created = res.data;
      setCategories((prev) => [
        ...prev,
        {
          id: created.id,
          name: created.name,
          slug: created.slug,
          description: null,
          parentId: null,
          _count: { articles: 0 },
        },
      ]);
      setIsCreatingInlineRoot(false);
      setInlineRootName('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t`Échec de la création de la catégorie.`);
    } finally {
      setIsCreatingInline(false);
    }
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
        parentId: newCatParentId || null,
      });

      if (!res.ok) throw new Error(res.error.message);
      if (!res.data) throw new Error(t`Échec de création de la catégorie.`);
      const created = res.data;

      const newCatWithCount: CategoryWithCount = {
        id: created.id,
        name: created.name,
        slug: created.slug,
        description: created.description,
        parentId: created.parentId ?? (newCatParentId || null),
        _count: { articles: 0 },
      };

      setCategories((prev) =>
        [...prev, newCatWithCount].sort((a, b) => a.name.localeCompare(b.name))
      );

      setNewCatName('');
      setNewCatSlug('');
      setNewCatDesc('');
      setNewCatParentId('');
      setCategorySuccess(true);
      setTimeout(() => setCategorySuccess(false), 3000);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t`Une erreur est survenue lors de la création de la catégorie.`;
      setCategoryError(message);
    } finally {
      setIsCreatingCategory(false);
    }
  };

  // Open edit modal
  const handleOpenEdit = (cat: CategoryWithCount) => {
    setEditingCat(cat);
    setEditCatName(cat.name);
    setEditCatSlug(cat.slug);
    setEditCatDesc(cat.description || '');
    setEditCatParentId(cat.parentId || '');
    setEditError(null);
  };

  // Handle category update
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat || !editCatName.trim()) return;

    if (editCatParentId && hasChildren(editingCat.id)) {
      setEditError(
        t`Cette catégorie contient déjà des sous-catégories et ne peut pas devenir une sous-catégorie.`
      );
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);

    try {
      const res = await saveCategoryAction({
        id: editingCat.id,
        name: editCatName.trim(),
        slug: editCatSlug.trim() || undefined,
        description: editCatDesc.trim() || null,
        parentId: editCatParentId || null,
      });

      if (!res.ok) throw new Error(res.error.message);
      if (!res.data) throw new Error(t`Échec de la mise à jour de la catégorie.`);

      const updated = res.data;
      setCategories((prev) =>
        prev.map((c) =>
          c.id === editingCat.id
            ? {
                ...c,
                name: updated.name,
                slug: updated.slug,
                description: updated.description,
                parentId: updated.parentId,
              }
            : c
        )
      );
      setEditingCat(null);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : t`Erreur lors de la mise à jour.`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Handle category deletion
  const handleDeleteCategory = async (id: string, name: string) => {
    const isParentWithSubs = categories.some((c) => c.parentId === id);
    const confirmMessage = isParentWithSubs
      ? t`Êtes-vous sûr de vouloir supprimer la catégorie "${name}" ? Ses sous-catégories seront conservées et promues en catégories principales.`
      : t`Êtes-vous sûr de vouloir supprimer la catégorie "${name}" ?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      await deleteCategoryAction(id);
      setCategories((prev) =>
        prev
          .filter((c) => c.id !== id)
          .map((c) => (c.parentId === id ? { ...c, parentId: null } : c))
      );
      setArticles((prev) =>
        prev.map((art) =>
          art.categoryId === id ? { ...art, categoryId: null, category: null } : art
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t`Échec de la suppression.`;
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
      const message = err instanceof Error ? err.message : t`Échec de la suppression.`;
      alert(message);
    }
  };

  // Handle review (approve / reject)
  const handleReview = async (id: string, approve: boolean, title: string) => {
    const verb = approve ? 'approuver' : 'rejeter';
    if (!confirm(`Voulez-vous vraiment ${verb} l'écrit "${title}" ?`)) {
      return;
    }
    try {
      await reviewArticleAction({ id, approve });
      setArticles((prev) =>
        prev.map((a) =>
          a.id === id
            ? approve
              ? { ...a, published: true, status: 'PUBLISHED' }
              : { ...a, published: false, status: 'DRAFT' }
            : a
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t`Échec de la revue.`;
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

  // Category matching including sub-categories
  const matchingCategoryIds = useMemo(() => {
    if (selectedCategory === 'all') return null;
    const childIds = categories.filter((c) => c.parentId === selectedCategory).map((c) => c.id);
    return new Set([selectedCategory, ...childIds]);
  }, [selectedCategory, categories]);

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
      if (statusFilter === 'draft' && (art.published || art.status === 'SUBMITTED')) return false;
      if (statusFilter === 'review' && art.status !== 'SUBMITTED') return false;

      // 3. Category filter (matches parent or sub-categories)
      if (matchingCategoryIds && (!art.categoryId || !matchingCategoryIds.has(art.categoryId))) {
        return false;
      }

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
  const countDrafts = articles.filter((a) => !a.published && a.status !== 'SUBMITTED').length;
  const countReview = articles.filter((a) => a.status === 'SUBMITTED').length;

  return (
    <div className="space-y-6 w-full pb-24 text-foreground font-sans selection:bg-primary/20 selection:text-primary">
      {/* Main Stage Headline */}
      <section className="pt-4 md:pt-2 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-foreground font-sans">{t`Articles`}</h2>

          {/* Tab Switcher: Articles vs Catégories */}
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
              {t`Écrits`} ({articles.length})
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
              {t`Catégories`} ({categories.length})
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
                placeholder={t`Rechercher un écrit par titre ou slug...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-muted/30 border border-border/40 rounded-xl pl-9 pr-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors font-sans"
              />
            </div>

            {/* Restored Clean Filtering Navigation Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/30">
              {/* Left Side: Status Segment Tabs */}
              <div className="flex items-center gap-6 overflow-x-auto no-scrollbar pt-1">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={cn(
                    'pb-2 -mb-3 border-b-2 transition-all cursor-pointer text-xs font-sans',
                    statusFilter === 'all'
                      ? 'border-primary text-primary font-bold'
                      : 'border-transparent text-muted-foreground hover:text-foreground font-medium'
                  )}
                >
                  {t`Tous`} ({articles.length})
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
                  {t`Publiés`} ({countPublished})
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
                  {t`Brouillons`} ({countDrafts})
                </button>
                {canReview && countReview > 0 && (
                  <button
                    onClick={() => setStatusFilter('review')}
                    className={cn(
                      'pb-2 -mb-3 border-b-2 transition-all cursor-pointer text-xs font-sans',
                      statusFilter === 'review'
                        ? 'border-primary text-primary font-bold'
                        : 'border-transparent text-muted-foreground hover:text-foreground font-medium'
                    )}
                  >
                    {t`En revue`} ({countReview})
                  </button>
                )}
              </div>

              {/* Right Side: Sleek Hairline Select Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Hairline Category Dropdown with Hierarchy */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-background border border-border/30 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:border-border/60 transition-colors cursor-pointer font-sans"
                >
                  <option value="all">{t`Toutes les catégories`}</option>
                  {rootCategories.map((root) => {
                    const subs = categories.filter((c) => c.parentId === root.id);
                    return (
                      <React.Fragment key={root.id}>
                        <option value={root.id}>
                          {root.name} ({root._count.articles})
                        </option>
                        {subs.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            &nbsp;&nbsp;↳ {sub.name} ({sub._count.articles})
                          </option>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </select>

                {/* Hairline Access Level Dropdown */}
                <select
                  value={accessFilter}
                  onChange={(e) => setAccessFilter(e.target.value as AccessFilter)}
                  className="bg-background border border-border/30 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:border-border/60 transition-colors cursor-pointer font-sans"
                >
                  <option value="all">{t`Tous les accès`}</option>
                  <option value="free">Gratuits</option>
                  <option value="premium">Premium Paywall</option>
                </select>

                {/* Période Vues (ReadingSession) */}
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as '7d' | '30d' | '90d' | 'all')}
                  className="bg-background border border-border/30 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:border-border/60 transition-colors cursor-pointer font-sans"
                  title={t`Période des vues (toutes les lectures envoyées au créateur)`}
                >
                  <option value="7d">Vues 7j</option>
                  <option value="30d">Vues 30j</option>
                  <option value="90d">Vues 90j</option>
                  <option value="all">Vues Tout</option>
                </select>

                <div className="h-4 w-[1px] bg-border/30 hidden sm:block" />

                {/* Hairline Sort Field Dropdown */}
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="bg-background border border-border/30 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:border-border/60 transition-colors cursor-pointer font-sans"
                >
                  <option value="updatedAt">{t`Trier par : Récents`}</option>
                  <option value="createdAt">{t`Trier par : Création`}</option>
                  <option value="title">Trier par : Titre (A-Z)</option>
                  <option value="readingTime">{t`Trier par : Durée`}</option>
                </select>

                {/* Hairline Sort Direction Toggle */}
                <button
                  onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-background border border-border/30 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-sans"
                  title={t`Ordre : ${sortDirection === 'desc' ? t`Décroissant` : t`Croissant`}`}
                >
                  <ArrowUpDown className="w-3 h-3 stroke-[1.5]" />
                  <span className="uppercase text-[10px] font-bold">{sortDirection}</span>
                </button>

                {/* Hairline Active Filter Reset Button */}
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors cursor-pointer font-sans"
                    title={t`Réinitialiser tous les filtres`}
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
                      : t`Prenez la plume pour donner corps à vos pensées.`}
                  </p>
                </div>
                {hasActiveFilters ? (
                  <button
                    onClick={resetFilters}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-muted text-foreground font-semibold text-xs rounded-xl hover:bg-muted/80 transition-colors cursor-pointer"
                  >
                    <FilterX className="w-3.5 h-3.5" />
                    <span>{t`Réinitialiser les filtres`}</span>
                  </button>
                ) : (
                  <a
                    href="/articles/new"
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t`Rédiger un article`}</span>
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
                          {art.status === 'SUBMITTED' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-highlight/10 text-highlight border border-highlight/20 font-sans">
                              <Clock className="w-3 h-3" strokeWidth={1.5} />
                              En revue
                            </span>
                          ) : (
                            <span
                              className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium font-sans',
                                art.published
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-muted text-muted-foreground border border-border/30'
                              )}
                            >
                              {art.published ? t`Publié` : t`Brouillon`}
                            </span>
                          )}

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
                          title={`Vues ${period} — ${art.viewsUnique ?? 0} uniques / ${art.views ?? 0} totales • Cliquez pour tout l'analytics`}
                        >
                          <Eye className="w-3.5 h-3.5 stroke-[1.5]" />
                          <span className={isLoadingViews ? 'opacity-50' : ''}>
                            {art.views ?? 0}
                            {art.viewsUnique != null && art.viewsUnique !== art.views
                              ? ` (${art.viewsUnique})`
                              : ''}
                          </span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectingArticle({ id: art.id, slug: art.slug });
                          }}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer p-1 rounded hover:bg-muted/60"
                          title={t`Voir les réactions, surlignages & commentaires`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 stroke-[1.5]" />
                          <span>{art.commentsCount ?? interactionsCount}</span>
                        </button>
                      </div>

                      {/* Direct Action Controls */}
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        {canReview && art.status === 'SUBMITTED' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReview(art.id, true, art.title);
                              }}
                              className="p-1.5 text-success hover:bg-success/10 rounded transition-colors cursor-pointer"
                              title={t`Approuver et publier`}
                            >
                              <CheckCircle2 className="w-4 h-4 stroke-[1.5]" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReview(art.id, false, art.title);
                              }}
                              className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer"
                              title={t`Rejeter (retour en brouillon)`}
                            >
                              <XCircle className="w-4 h-4 stroke-[1.5]" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectingArticle({ id: art.id, slug: art.slug });
                          }}
                          className="p-1.5 text-muted-foreground hover:text-primary rounded hover:bg-muted transition-colors cursor-pointer"
                          title={t`Analyses de l'article`}
                        >
                          <BarChart3 className="w-4 h-4 stroke-[1.5]" />
                        </button>

                        <a
                          href={`/articles/${art.id}`}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
                          title={t`Éditer`}
                        >
                          <Edit3 className="w-4 h-4 stroke-[1.5]" />
                        </a>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteArticle(art.id, art.title);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors cursor-pointer"
                          title={t`Supprimer`}
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
          /* Categories / Taxonomie View */
          <motion.div
            key="categories-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-10 pt-2"
          >
            {/* Left: Categories hierarchy & Drag and Drop zone */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground font-sans flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-primary" />
                    {t`Arborescence des catégories`}
                  </h3>
                  <p className="text-xs text-muted-foreground font-sans">
                    {t`Glissez-déposez à la souris pour convertir une catégorie en sous-catégorie ou réorganiser.`}
                  </p>
                </div>
              </div>

              {/* Live Drag Feedback Banner */}
              {draggedCat && (
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-between gap-3 text-xs font-medium text-primary">
                  <div className="flex items-center gap-2 min-w-0">
                    <Move className="w-4 h-4 shrink-0 animate-pulse text-primary" />
                    <span className="truncate">
                      {t`Déplacement de "${draggedCat.name}" en cours`} —{' '}
                      {t`survolez un dossier cible pour prévisualiser`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDragEnd}
                    className="text-[11px] px-2.5 py-1 bg-background border border-border/60 hover:bg-muted rounded-lg text-foreground cursor-pointer transition-colors shrink-0"
                  >
                    {t`Annuler`}
                  </button>
                </div>
              )}

              {/* Badge flottant qui suit le pointeur de souris lors du Drag */}
              {draggedCat && pointerPos && (
                <div
                  style={{
                    position: 'fixed',
                    left: pointerPos.x + 14,
                    top: pointerPos.y + 14,
                    pointerEvents: 'none',
                    zIndex: 9999,
                  }}
                  className="bg-primary text-primary-foreground font-sans text-xs font-semibold px-3 py-1.5 rounded-lg shadow-2xl flex items-center gap-2 border border-primary-foreground/20 backdrop-blur-md select-none transition-transform"
                >
                  <Move className="w-3.5 h-3.5" />
                  <span>{draggedCat.name}</span>
                  {dragOverParentId ? (
                    <span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded text-primary-foreground font-normal">
                      ↳ {categories.find((c) => c.id === dragOverParentId)?.name}
                    </span>
                  ) : dragOverRoot ? (
                    <span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded text-primary-foreground font-normal">
                      ↳ {t`Catégorie principale`}
                    </span>
                  ) : null}
                </div>
              )}

              {/* Zone de largage pour promouvoir en catégorie racine */}
              {draggedCat?.parentId && (
                <div
                  data-drop-zone="root"
                  onClick={() => handleDropOnRoot(draggedCat.id)}
                  className={cn(
                    'p-3.5 rounded-xl border-2 border-dashed transition-all flex items-center justify-center gap-2 text-xs font-sans font-semibold cursor-pointer',
                    dragOverRoot
                      ? 'border-primary bg-primary/15 text-primary scale-[1.01] shadow-md ring-2 ring-primary/30'
                      : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                  )}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  {t`Déposer ici pour promouvoir en catégorie principale`}
                </div>
              )}

              {categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 px-6 text-center space-y-4 font-sans border-2 border-dashed border-border/70 hover:border-primary/40 rounded-2xl bg-muted/5 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                    <FolderTree className="w-6 h-6" />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <h4 className="text-sm font-bold text-foreground font-sans">
                      {t`Aucune catégorie pour le moment`}
                    </h4>
                    <p className="text-xs text-muted-foreground font-sans leading-relaxed">
                      {t`Organisez vos articles avec des thématiques claires et des sous-catégories à 2 niveaux.`}
                    </p>
                  </div>

                  {isCreatingInlineRoot ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleInlineCreateRoot();
                      }}
                      className="w-full max-w-md p-2 rounded-xl bg-card border border-primary/50 shadow-md flex items-center gap-2"
                    >
                      <FolderOpen className="w-4 h-4 text-primary shrink-0 ml-1.5" />
                      <input
                        autoFocus
                        type="text"
                        value={inlineRootName}
                        onChange={(e) => setInlineRootName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setIsCreatingInlineRoot(false);
                        }}
                        placeholder={t`Nom de la catégorie principale... (Entrée)`}
                        className="flex-1 bg-transparent border-0 text-xs font-sans text-foreground placeholder:text-muted-foreground focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isCreatingInline || !inlineRootName.trim()}
                        className="px-3 py-1.5 text-xs font-bold font-sans bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
                      >
                        {isCreatingInline ? t`...` : t`Créer`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingInlineRoot(false)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingInlineRoot(true);
                        setInlineRootName('');
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold font-sans transition-all cursor-pointer shadow-xs hover:shadow-sm active:scale-[0.98]"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                      <span>{t`Créer votre première catégorie`}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {rootCategories.map((root) => {
                    const subCategories = categories.filter((c) => c.parentId === root.id);
                    const totalArticles =
                      root._count.articles +
                      subCategories.reduce((acc, s) => acc + s._count.articles, 0);

                    const canBeDropTarget =
                      draggedId && draggedId !== root.id && !hasChildren(draggedId);
                    const isDropTarget = dragOverParentId === root.id;

                    return (
                      <div
                        key={root.id}
                        data-category-drop-id={root.id}
                        className={cn(
                          'p-3.5 rounded-xl border transition-all duration-200 bg-card',
                          isDropTarget
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md'
                            : editingCat?.id === root.id
                              ? 'border-primary/60 ring-1 ring-primary/30'
                              : 'border-border/40 hover:border-border/80'
                        )}
                      >
                        {/* Root Category Header Row */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Drag Handle */}
                            <div
                              onPointerDown={(e) => {
                                if (!hasChildren(root.id)) {
                                  handlePointerDown(e, root.id);
                                }
                              }}
                              className={cn(
                                'p-1 text-muted-foreground/50 hover:text-foreground rounded transition-colors touch-none select-none',
                                hasChildren(root.id)
                                  ? 'opacity-30 cursor-not-allowed'
                                  : 'cursor-grab active:cursor-grabbing'
                              )}
                              title={
                                hasChildren(root.id)
                                  ? t`Une catégorie mère avec des sous-catégories ne peut pas devenir sous-catégorie.`
                                  : t`Glisser pour déplacer`
                              }
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>

                            <FolderOpen className="w-4 h-4 text-primary shrink-0" />

                            <div className="min-w-0 flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-semibold text-foreground font-sans truncate">
                                {root.name}
                              </h4>
                              <span className="text-[11px] text-muted-foreground font-sans font-medium tabular-nums">
                                ({totalArticles} {totalArticles > 1 ? t`articles` : t`article`})
                              </span>
                              {subCategories.length > 0 && (
                                <span className="text-[10px] bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded font-sans font-medium">
                                  {subCategories.length}{' '}
                                  {subCategories.length > 1
                                    ? t`sous-catégories`
                                    : t`sous-catégorie`}
                                </span>
                              )}
                              <span className="text-[11px] font-sans font-medium text-muted-foreground/70">
                                /{root.slug}
                              </span>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Bouton déplacement 1 clic si pas d'enfants */}
                            {!hasChildren(root.id) && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMovingCatId(movingCatId === root.id ? null : root.id)
                                  }
                                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
                                  title={t`Déplacer sous une autre catégorie (1 clic)`}
                                >
                                  <FolderInput className="w-3.5 h-3.5 stroke-[1.5]" />
                                </button>
                                {movingCatId === root.id && (
                                  <div className="absolute right-0 top-full mt-1.5 z-40 w-52 bg-card border border-border/60 rounded-xl shadow-xl p-1.5 space-y-1 text-xs">
                                    <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                      {t`Déplacer sous...`}
                                    </div>
                                    {rootCategories
                                      .filter((r) => r.id !== root.id)
                                      .map((r) => (
                                        <button
                                          key={r.id}
                                          type="button"
                                          onClick={async () => {
                                            setMovingCatId(null);
                                            await handleDropOnParent(r.id, root.id);
                                          }}
                                          className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2 transition-colors cursor-pointer truncate"
                                        >
                                          <FolderOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                                          <span className="truncate">{r.name}</span>
                                        </button>
                                      ))}
                                  </div>
                                )}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setInlineCreatingParentId(root.id);
                                setInlineSubName('');
                              }}
                              className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
                              title={t`Ajouter une sous-catégorie directement`}
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                            <button
                              onClick={() => handleOpenEdit(root)}
                              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
                              title={t`Modifier`}
                            >
                              <Edit3 className="w-3.5 h-3.5 stroke-[1.5]" />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(root.id, root.name)}
                              className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
                              title={t`Supprimer`}
                            >
                              <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                            </button>
                          </div>
                        </div>

                        {root.description && (
                          <p className="text-xs text-muted-foreground font-sans leading-relaxed pt-1.5 pl-8">
                            {root.description}
                          </p>
                        )}

                        {/* Drop hint when hovered */}
                        {isDropTarget && (
                          <div className="mt-2.5 ml-8 py-2 px-3 border border-dashed border-primary rounded-lg bg-primary/10 text-primary text-xs font-sans font-medium flex items-center gap-1.5 animate-pulse">
                            <CornerDownRight className="w-3.5 h-3.5" />
                            {t`Déposer ici pour ajouter en sous-catégorie de "${root.name}"`}
                          </div>
                        )}

                        {/* Nested Sub-Categories + Live Ghost Preview + Inline Quick Create */}
                        <div className="mt-3 ml-7 pl-3 border-l-2 border-border/40 space-y-1.5">
                          {subCategories.map((sub) => (
                            <div
                              key={sub.id}
                              onPointerDown={(e) => handlePointerDown(e, sub.id)}
                              className={cn(
                                'py-1.5 px-2 rounded-lg flex items-center justify-between gap-3 bg-muted/20 hover:bg-muted/40 transition-colors cursor-grab active:cursor-grabbing border border-transparent hover:border-border/30 touch-none select-none',
                                draggedId === sub.id &&
                                  'opacity-40 border-dashed border-primary ring-1 ring-primary/40'
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                                <CornerDownRight className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                                <span className="text-xs font-medium text-foreground font-sans truncate">
                                  {sub.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-sans tabular-nums">
                                  ({sub._count.articles}{' '}
                                  {sub._count.articles > 1 ? t`articles` : t`article`})
                                </span>
                                <span className="text-[10px] font-sans font-medium text-muted-foreground/70">
                                  /{sub.slug}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {/* Menu rapide Déplacer vers... */}
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMovingCatId(movingCatId === sub.id ? null : sub.id)
                                    }
                                    className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors cursor-pointer"
                                    title={t`Déplacer vers... (1 clic)`}
                                  >
                                    <FolderInput className="w-3.5 h-3.5 stroke-[1.5]" />
                                  </button>
                                  {movingCatId === sub.id && (
                                    <div className="absolute right-0 top-full mt-1.5 z-40 w-52 bg-card border border-border/60 rounded-xl shadow-xl p-1.5 space-y-1 text-xs">
                                      <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        {t`Déplacer vers...`}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          setMovingCatId(null);
                                          await handleDropOnRoot(sub.id);
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2 transition-colors cursor-pointer"
                                      >
                                        <ArrowUpRight className="w-3.5 h-3.5 text-primary shrink-0" />
                                        <span>{t`Catégorie principale`}</span>
                                      </button>
                                      {rootCategories
                                        .filter((r) => r.id !== sub.parentId)
                                        .map((r) => (
                                          <button
                                            key={r.id}
                                            type="button"
                                            onClick={async () => {
                                              setMovingCatId(null);
                                              await handleDropOnParent(r.id, sub.id);
                                            }}
                                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2 transition-colors cursor-pointer truncate"
                                          >
                                            <FolderOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                                            <span className="truncate">{r.name}</span>
                                          </button>
                                        ))}
                                    </div>
                                  )}
                                </div>

                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await moveCategoryAction({
                                        id: sub.id,
                                        parentId: null,
                                      });
                                      if (!res.ok) throw new Error(res.error.message);
                                      setCategories((prev) =>
                                        prev.map((c) =>
                                          c.id === sub.id ? { ...c, parentId: null } : c
                                        )
                                      );
                                    } catch (err: unknown) {
                                      alert(
                                        err instanceof Error
                                          ? err.message
                                          : t`Échec de la promotion.`
                                      );
                                    }
                                  }}
                                  className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors cursor-pointer"
                                  title={t`Promouvoir en catégorie principale`}
                                >
                                  <ArrowUpRight className="w-3.5 h-3.5 stroke-[1.5]" />
                                </button>
                                <button
                                  onClick={() => handleOpenEdit(sub)}
                                  className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors cursor-pointer"
                                  title={t`Modifier`}
                                >
                                  <Edit3 className="w-3.5 h-3.5 stroke-[1.5]" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCategory(sub.id, sub.name)}
                                  className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors cursor-pointer"
                                  title={t`Supprimer`}
                                >
                                  <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* Live Insertion Ghost Preview during Drag */}
                          {isDropTarget && draggedCat && (
                            <div className="py-2 px-3 rounded-lg border-2 border-dashed border-primary bg-primary/10 flex items-center gap-2 text-xs font-semibold text-primary animate-pulse shadow-sm">
                              <CornerDownRight className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span>↳ {draggedCat.name}</span>
                              <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full ml-auto font-medium">
                                {t`Aperçu du nouvel emplacement`}
                              </span>
                            </div>
                          )}

                          {/* Inline Sub-Category Creation Form */}
                          {inlineCreatingParentId === root.id ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleInlineCreateSubCategory(root.id);
                              }}
                              className="py-1 flex items-center gap-2 pt-1"
                            >
                              <CornerDownRight className="w-3.5 h-3.5 text-primary shrink-0" />
                              <input
                                autoFocus
                                type="text"
                                value={inlineSubName}
                                onChange={(e) => setInlineSubName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') setInlineCreatingParentId(null);
                                }}
                                placeholder={t`Nom de la sous-catégorie... (Entrée)`}
                                className="flex-1 bg-background border border-primary/50 focus:border-primary rounded-lg px-2.5 py-1 text-xs text-foreground focus:outline-none transition-all shadow-xs"
                              />
                              <button
                                type="submit"
                                disabled={isCreatingInline || !inlineSubName.trim()}
                                className="px-2.5 py-1 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
                              >
                                {isCreatingInline ? t`...` : t`Créer`}
                              </button>
                              <button
                                type="button"
                                onClick={() => setInlineCreatingParentId(null)}
                                className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setInlineCreatingParentId(root.id);
                                setInlineSubName('');
                              }}
                              className="group flex items-center gap-1.5 text-[11px] text-muted-foreground/75 hover:text-foreground hover:bg-muted/40 px-2 py-1 rounded-md transition-colors cursor-pointer mt-1"
                            >
                              <Plus className="w-3 h-3 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                              <span>{t`Ajouter une sous-catégorie`}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Bouton ou formulaire inline pour créer une catégorie principale */}
                  {isCreatingInlineRoot ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleInlineCreateRoot();
                      }}
                      className="p-3.5 rounded-xl border border-primary/50 bg-card flex items-center gap-2.5 shadow-sm"
                    >
                      <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                      <input
                        autoFocus
                        type="text"
                        value={inlineRootName}
                        onChange={(e) => setInlineRootName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setIsCreatingInlineRoot(false);
                        }}
                        placeholder={t`Nom de la catégorie principale... (Entrée pour valider)`}
                        className="flex-1 bg-background border border-primary/40 focus:border-primary rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none transition-all"
                      />
                      <button
                        type="submit"
                        disabled={isCreatingInline || !inlineRootName.trim()}
                        className="px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {isCreatingInline ? t`...` : t`Créer`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingInlineRoot(false)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingInlineRoot(true);
                        setInlineRootName('');
                      }}
                      className="w-full py-2.5 px-3 rounded-xl border border-dashed border-border/70 hover:border-primary/60 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      {t`Nouvelle catégorie principale`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right Panel: Contextual Category Editor */}
            <div className="md:col-span-1">
              {editingCat ? (
                <div className="bg-card border border-border/40 rounded-xl p-5 space-y-4 shadow-none sticky top-6">
                  <div className="flex items-center justify-between gap-2 border-b border-border/30 pb-3">
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-foreground uppercase tracking-wider font-sans truncate">
                        {t`Modifier la catégorie`}
                      </h3>
                      <p className="text-muted-foreground text-[11px] truncate font-sans">
                        {editingCat.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingCat(null)}
                      className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
                      title={t`Fermer`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleSaveEdit} className="space-y-3.5 font-sans">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-sans font-semibold">
                        {t`Nom de la catégorie`}
                      </label>
                      <input
                        type="text"
                        value={editCatName}
                        onChange={(e) => setEditCatName(e.target.value)}
                        required
                        className="w-full bg-background border border-border/40 rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-primary transition-colors font-sans"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-sans font-semibold">
                        {t`Catégorie parente`}
                      </label>
                      <select
                        value={editCatParentId}
                        onChange={(e) => setEditCatParentId(e.target.value)}
                        disabled={hasChildren(editingCat.id)}
                        className={cn(
                          'w-full bg-background border border-border/40 rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-primary transition-colors font-sans',
                          hasChildren(editingCat.id)
                            ? 'opacity-50 cursor-not-allowed'
                            : 'cursor-pointer'
                        )}
                      >
                        <option value="">{t`-- Aucune (catégorie principale) --`}</option>
                        {rootCategories
                          .filter((rc) => rc.id !== editingCat.id)
                          .map((rc) => (
                            <option key={rc.id} value={rc.id}>
                              {rc.name}
                            </option>
                          ))}
                      </select>
                      {hasChildren(editingCat.id) && (
                        <p className="text-[10px] text-muted-foreground/80 italic">
                          {t`Cette catégorie possède déjà des sous-catégories et doit rester une catégorie principale.`}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-sans font-semibold">
                        {t`Slug URL`}
                      </label>
                      <input
                        type="text"
                        value={editCatSlug}
                        onChange={(e) =>
                          setEditCatSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
                        }
                        required
                        className="w-full bg-background border border-border/40 rounded-lg p-2 text-xs font-sans text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-sans font-semibold">
                        {t`Description`}
                      </label>
                      <textarea
                        rows={3}
                        value={editCatDesc}
                        onChange={(e) => setEditCatDesc(e.target.value)}
                        placeholder={t`Courte description thématique...`}
                        className="w-full bg-background border border-border/40 rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-primary transition-colors font-sans resize-none"
                      />
                    </div>

                    {editError && (
                      <div className="bg-destructive/10 border border-destructive/20 text-destructive p-2.5 rounded-lg text-[11px] flex gap-2 font-sans">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{editError}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingCat(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-sans text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        {t`Annuler`}
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingEdit || !editCatName.trim()}
                        className="px-4 py-1.5 rounded-lg text-xs font-sans font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {isSavingEdit ? t`Enregistrement...` : t`Enregistrer`}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="bg-card border border-border/40 rounded-xl p-5 space-y-4 shadow-none sticky top-6">
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider font-sans flex items-center gap-2">
                      <FolderTree className="w-4 h-4 text-primary" />
                      {t`Gestion des catégories`}
                    </h3>
                    <p className="text-muted-foreground text-xs leading-relaxed font-sans">
                      {t`Cliquez sur l'icône de crayon d'une catégorie pour la modifier ici sans quitter la page.`}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border/30 space-y-2.5 text-xs text-muted-foreground font-sans">
                    <div className="flex items-start gap-2">
                      <GripVertical className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <span>{t`Glissez et déposez à la souris pour convertir une catégorie en sous-catégorie.`}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Plus className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <span>{t`Cliquez sur "+" directement sous un dossier pour ajouter une sous-catégorie instantanément.`}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Article Inspector Drawer Modal — période synchronisée avec la liste, toutes les données envoyées */}
      {inspectingArticle && (
        <ArticleInspectorModal
          urlPath={`/article/${inspectingArticle.slug}`}
          articleId={inspectingArticle.id}
          period={period}
          onClose={() => setInspectingArticle(null)}
          onEdit={() => {
            window.location.href = `/articles/${inspectingArticle.id}`;
          }}
        />
      )}
    </div>
  );
}
