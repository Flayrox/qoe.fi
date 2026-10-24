'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  Search,
  AlertCircle,
  ArrowUpDown,
  FilterX,
  GripVertical,
  FolderOpen,
  FolderTree,
  CornerDownRight,
  ArrowUpRight,
  X,
  Move,
  FolderInput,
  Pin,
  Lock,
  SlidersHorizontal,
  Rows3,
  Save,
} from 'lucide-react';

/** Slug canonique de l'article « À propos » (page publique : /about). */
const ABOUT_ARTICLE_SLUG = 'about';
/** Valeur héritée encore présente dans des articles existants — lecture seule. */
const LEGACY_ABOUT_ARTICLE_SLUGS = ['a-propos'];

function isAboutArticle(
  article: { id: string; slug: string },
  aboutArticleId: string | null
): boolean {
  return (
    aboutArticleId === article.id ||
    article.slug === ABOUT_ARTICLE_SLUG ||
    LEGACY_ABOUT_ARTICLE_SLUGS.includes(article.slug)
  );
}
import { cn, slugify } from '@qoe/utils';
import { isReservedTenantRoute } from '@qoe/config';
import { useRouter } from 'next/navigation';
import {
  deleteArticleAction,
  saveCategoryAction,
  deleteCategoryAction,
  reviewArticleAction,
  getArticlesAction,
  moveCategoryAction,
  getArticleByIdAction,
  discardArticleDraftAction,
} from '@qoe/sdk/actions/articles';
import { updateCreatorProfileAction } from '@qoe/sdk/actions/dashboard';
import { toast } from '@qoe/ui/toast';
import { t } from '@lingui/core/macro';

import { ArticleInspectorModal } from '../analytics/components/ArticleInspectorModal';
import { ArticleBulkSettingsDialog } from './components/article-bulk-settings-dialog';
import { ArticleListRow } from './components/article-list-row';
import { ArticleSettingsSheet } from './components/article-settings-sheet';
import { ArticleDiffModal } from '@/features/editor/components/ArticleDiffModal';
import { ConfirmActionDialog, type ConfirmAction } from './components/confirm-action-dialog';
import type {
  AccessFilter,
  ArticleWithCategory,
  CategoryWithCount,
  Density,
  ListColumnPrefs,
  SavedListView,
  SortDirection,
  SortField,
  StatusFilter,
} from './components/article-list-types';

interface ArticlesClientProps {
  initialArticles: ArticleWithCategory[];
  initialCategories: CategoryWithCount[];
  initialPinnedArticleId?: string | null;
  initialAboutArticleId?: string | null;
  initialTab?: 'articles' | 'categories';
  canReview?: boolean;
  canPublish?: boolean;
}

export function ArticlesClient({
  initialArticles,
  initialCategories,
  initialPinnedArticleId = null,
  initialAboutArticleId = null,
  initialTab = 'articles',
  canReview = false,
  canPublish = false,
}: ArticlesClientProps) {
  const [activeMainTab, setActiveMainTab] = useState<'articles' | 'categories'>(initialTab);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [articles, setArticles] = useState<ArticleWithCategory[]>(initialArticles);
  const [categories, setCategories] = useState<CategoryWithCount[]>(initialCategories);
  const [pinnedArticleId, setPinnedArticleId] = useState<string | null>(initialPinnedArticleId);
  const [aboutArticleId, setAboutArticleId] = useState<string | null>(initialAboutArticleId);

  const handleTogglePin = async (id: string) => {
    const nextPinned = pinnedArticleId === id ? null : id;
    setPinnedArticleId(nextPinned);
    try {
      await updateCreatorProfileAction({
        siteOptions: {
          pinnedArticleId: nextPinned,
        },
      });
      toast.success(nextPinned ? t`Article épinglé à la une !` : t`Article retiré de la une.`);
    } catch (err) {
      console.error('Failed to pin article', err);
      setPinnedArticleId(pinnedArticleId);
      toast.error(t`Impossible de modifier l'épinglage.`);
    }
  };

  const requestConfirm = (action: ConfirmAction) => setConfirmAction(action);

  const requestTogglePin = (id: string, title: string) => {
    const isPinned = pinnedArticleId === id;
    requestConfirm({
      title: isPinned ? t`Retirer cet article de la une ?` : t`Épingler cet article à la une ?`,
      description: isPinned
        ? t`« ${title} » ne sera plus mis en avant sur votre page d'accueil.`
        : t`« ${title} » sera mis en avant sur votre page d'accueil.`,
      confirmLabel: isPinned ? t`Retirer de la une` : t`Épingler`,
      onConfirm: () => handleTogglePin(id),
    });
  };

  const handleToggleAbout = async (id: string) => {
    const nextAbout = aboutArticleId === id ? null : id;
    setAboutArticleId(nextAbout);
    try {
      await updateCreatorProfileAction({
        siteOptions: {
          aboutArticleId: nextAbout,
        },
      });
      toast.success(
        nextAbout ? t`Article défini comme page À propos !` : t`Article retiré de la page À propos.`
      );
    } catch (err) {
      console.error('Failed to set about article', err);
      setAboutArticleId(aboutArticleId);
      toast.error(t`Impossible de modifier la page À propos.`);
    }
  };

  // Search & Advanced Sorting & Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');

  // Vues period (ReadingSession) — 7j/30j/90j/all ; défaut 30j
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [density, setDensity] = useState<Density>('comfortable');
  const [columns, setColumns] = useState<ListColumnPrefs>({
    category: true,
    status: true,
    premium: false,
    updatedAt: true,
    views: true,
    comments: true,
  });
  const [savedViews, setSavedViews] = useState<Record<string, SavedListView>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [settingsArticleId, setSettingsArticleId] = useState<string | null>(null);
  const [bulkSettingsOpen, setBulkSettingsOpen] = useState(false);

  const router = useRouter();
  const [diffTarget, setDiffTarget] = useState<{
    article: ArticleWithCategory;
    liveContent: string;
    draftContent: string;
    draftTitle?: string;
  } | null>(null);

  const closeArticleSettings = React.useCallback(() => setSettingsArticleId(null), []);

  const handleOpenDiff = async (article: ArticleWithCategory) => {
    try {
      const res = await getArticleByIdAction(article.id);
      if (res.ok && res.data) {
        setDiffTarget({
          article,
          liveContent: res.data.liveContent || res.data.content,
          draftContent: res.data.draftContent || res.data.content,
          draftTitle: res.data.title,
        });
      } else {
        toast.error(t`Impossible de charger les versions de l'article.`);
      }
    } catch {
      toast.error(t`Erreur lors de la récupération des versions.`);
    }
  };

  const handleDiscardDraft = async (id: string) => {
    try {
      const res = await discardArticleDraftAction({ id });
      if (res.ok) {
        setArticles((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  hasUnpublishedChanges: false,
                  status: a.published ? 'PUBLISHED' : a.status,
                }
              : a
          )
        );
        toast.success(t`Brouillon abandonné. Version en ligne restaurée.`);
        if (diffTarget?.article.id === id) {
          setDiffTarget(null);
        }
      } else {
        toast.error(t`Impossible d'abandonner le brouillon.`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t`Erreur lors de l'abandon.`);
    }
  };

  const refreshArticles = async () => {
    const res = await getArticlesAction(period);
    if (res.ok && res.data) {
      setArticles(res.data as unknown as ArticleWithCategory[]);
    }
  };

  // Refetch Vues quand period change (30j initial déjà chargé côté serveur)
  React.useEffect(() => {
    let cancelled = false;
    getArticlesAction(period).then((res) => {
      if (!cancelled && res.ok && res.data) {
        setArticles(res.data as unknown as ArticleWithCategory[]);
      }
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
  const uncategorizedCount = useMemo(
    () => articles.filter((c) => !c.categoryId && !c.category).length,
    [articles]
  );

  const PREF_KEY = 'qoe.articles.list.preferences.v2';
  const VIEWS_KEY = 'qoe.articles.list.views';

  useEffect(() => {
    try {
      const rawPrefs = window.localStorage.getItem(PREF_KEY);
      if (rawPrefs) {
        const parsed = JSON.parse(rawPrefs) as Partial<SavedListView>;
        if (parsed.sortField) setSortField(parsed.sortField);
        if (parsed.sortDirection) setSortDirection(parsed.sortDirection);
        if (parsed.selectedCategory) setSelectedCategory(parsed.selectedCategory);
        if (parsed.accessFilter) setAccessFilter(parsed.accessFilter);
        if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
        if (parsed.density) setDensity(parsed.density);
        if (parsed.columns) setColumns((prev) => ({ ...prev, ...parsed.columns }));
      }
      const rawViews = window.localStorage.getItem(VIEWS_KEY);
      if (rawViews) setSavedViews(JSON.parse(rawViews) as Record<string, SavedListView>);
    } catch {
      // Préférences illisibles : on garde les valeurs par défaut.
    }
  }, []);

  const currentView = useMemo<SavedListView>(
    () => ({
      sortField,
      sortDirection,
      selectedCategory,
      accessFilter,
      statusFilter,
      density,
      columns,
    }),
    [sortField, sortDirection, selectedCategory, accessFilter, statusFilter, density, columns]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(currentView));
    } catch {
      // Stockage indisponible (navigation privée) : préférences éphémères.
    }
  }, [currentView]);

  const saveCurrentView = () => {
    const name = window.prompt('Nom de la vue (ex : Brouillons premium)');
    if (!name?.trim()) return;
    const next = { ...savedViews, [name.trim()]: currentView };
    setSavedViews(next);
    try {
      window.localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      // Ignore les erreurs de stockage.
    }
  };

  const applySavedView = (name: string) => {
    if (name === '__save') {
      saveCurrentView();
      return;
    }
    const view = savedViews[name];
    if (!view) return;
    setSortField(view.sortField);
    setSortDirection(view.sortDirection);
    setSelectedCategory(view.selectedCategory);
    setAccessFilter(view.accessFilter);
    setStatusFilter(view.statusFilter);
    setDensity(view.density);
    setColumns(view.columns);
  };

  const deleteSavedView = (name: string) => {
    const next = { ...savedViews };
    delete next[name];
    setSavedViews(next);
    try {
      window.localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      // Ignore.
    }
  };
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
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.getSelection()?.removeAllRanges();
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

      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      document.body.style.cursor = '';
      window.getSelection()?.removeAllRanges();

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
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    document.body.style.cursor = '';
    window.getSelection()?.removeAllRanges();
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

    const slug = slugify(name) || `cat-${Date.now()}`;
    if (isReservedTenantRoute(slug)) {
      toast.error(t`Le slug « ${slug} » est réservé par une page du site.`);
      return;
    }

    try {
      setIsCreatingInline(true);
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

    const slug = slugify(name) || `cat-${Date.now()}`;
    if (isReservedTenantRoute(slug)) {
      toast.error(t`Le slug « ${slug} » est réservé par une page du site.`);
      return;
    }

    try {
      setIsCreatingInline(true);
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

    const candidateSlug = slugify(newCatSlug.trim() || newCatName.trim());
    if (isReservedTenantRoute(candidateSlug)) {
      setCategoryError(
        t`Le slug « ${candidateSlug} » est réservé par une page du site. Choisissez un autre nom.`
      );
      return;
    }

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
        isDefault: created.isDefault ?? false,
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

    const candidateSlug = slugify(editCatSlug.trim() || editCatName.trim());
    if (isReservedTenantRoute(candidateSlug)) {
      setEditError(
        t`Le slug « ${candidateSlug} » est réservé par une page du site. Choisissez un autre nom.`
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
  const handleDeleteArticle = async (id: string) => {
    try {
      await deleteArticleAction(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success(t`Article supprimé.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t`Échec de la suppression.`;
      toast.error(message);
    }
  };

  const requestDeleteArticle = (id: string, title: string) => {
    requestConfirm({
      title: t`Supprimer cet article ?`,
      description: t`« ${title} » sera définitivement supprimé, avec ses interactions. Cette action est irréversible.`,
      confirmLabel: t`Supprimer`,
      destructive: true,
      onConfirm: () => handleDeleteArticle(id),
    });
  };

  // Handle review (approve / reject)
  const handleReview = async (id: string, approve: boolean, comment?: string) => {
    try {
      await reviewArticleAction({ id, approve, comment });
      setArticles((prev) =>
        prev.map((a) =>
          a.id === id
            ? approve
              ? { ...a, published: true, status: 'PUBLISHED', hasUnpublishedChanges: false }
              : { ...a, status: 'DRAFT' }
            : a
        )
      );
      toast.success(
        approve ? t`Article approuvé et publié.` : t`Demande de retouches transmise à l'auteur.`
      );
      if (diffTarget?.article.id === id) {
        setDiffTarget(null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t`Échec de la revue.`;
      toast.error(message);
    }
  };

  const requestReview = (id: string, approve: boolean, title: string) => {
    requestConfirm({
      title: approve ? t`Approuver et publier cet article ?` : t`Rejeter cet article ?`,
      description: approve
        ? t`« ${title} » sera publié immédiatement.`
        : t`« ${title} » repassera en brouillon et l'auteur devra le resoumettre.`,
      confirmLabel: approve ? t`Approuver et publier` : t`Rejeter`,
      destructive: !approve,
      onConfirm: () => handleReview(id, approve),
    });
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

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => deleteArticleAction(id)));
    const deleted = new Set(ids.filter((_, index) => results[index].status === 'fulfilled'));
    setArticles((prev) => prev.filter((art) => !deleted.has(art.id)));
    setSelectedIds(new Set());
    const failed = ids.length - deleted.size;
    if (deleted.size > 0) toast.success(`${deleted.size} ${t`article(s) supprimé(s)`}.`);
    if (failed > 0) toast.error(`${failed} ${t`suppression(s) ont échoué`}.`);
  };

  const requestBulkDelete = () => {
    const count = selectedIds.size;
    if (count === 0) return;
    requestConfirm({
      title: t`Supprimer ${count} article(s) ?`,
      description: t`Ces articles et leurs interactions seront définitivement supprimés. Cette action est irréversible.`,
      confirmLabel: t`Supprimer`,
      destructive: true,
      onConfirm: handleBulkDelete,
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    if (selectedCategory === 'all' || selectedCategory === 'uncategorized') return null;
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

      // 3. Category filter (matches parent or sub-categories, or uncategorized)
      if (selectedCategory === 'uncategorized') {
        if (art.categoryId || art.category) return false;
      } else if (
        matchingCategoryIds &&
        (!art.categoryId || !matchingCategoryIds.has(art.categoryId))
      ) {
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
      } else if (sortField === 'likes') {
        comparison = (a.likesCount || 0) - (b.likesCount || 0);
      } else if (sortField === 'reposts') {
        comparison = (a.repostsCount || 0) - (b.repostsCount || 0);
      } else if (sortField === 'engagement') {
        const score = (article: ArticleWithCategory) =>
          (article.likesCount || 0) +
          (article.repostsCount || 0) * 2 +
          (article.commentsCount || 0);
        comparison = score(a) - score(b);
      }

      if (comparison === 0) {
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
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

          <div className="flex items-center gap-2">
            {/* Shortcut: Page À propos */}
            {(() => {
              const targetAbout = articles.find((a) => isAboutArticle(a, aboutArticleId));
              return (
                <a
                  href={
                    targetAbout
                      ? `/articles/${targetAbout.id}`
                      : `/articles/new?slug=${ABOUT_ARTICLE_SLUG}&title=%C3%80%20propos`
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors font-sans',
                    targetAbout
                      ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                      : 'border-border/40 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                  title={t`Rédiger ou modifier la page À propos de votre publication comme un article complet`}
                >
                  <BookOpen className="w-3.5 h-3.5 stroke-[1.5]" />
                  <span>{t`Page À propos`}</span>
                </a>
              );
            })()}

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

            {/* Barre de contrôle épurée : tri + filtres + affichage */}
            <div className="flex flex-col gap-3 pb-2 border-b border-border/30">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-6 overflow-x-auto no-scrollbar pt-1">
                  {(
                    [
                      ['all', t`Tous`, articles.length],
                      ['published', t`Publiés`, countPublished],
                      ['draft', t`Brouillons`, countDrafts],
                      ...(canReview && countReview > 0
                        ? ([['review', t`En revue`, countReview]] as const)
                        : []),
                    ] as const
                  ).map(([value, label, count]) => (
                    <button
                      key={value}
                      onClick={() => setStatusFilter(value)}
                      className={cn(
                        'pb-2 -mb-3 border-b-2 transition-all cursor-pointer text-xs font-sans',
                        statusFilter === value
                          ? 'border-primary text-primary font-bold'
                          : 'border-transparent text-muted-foreground hover:text-foreground font-medium'
                      )}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as SortField)}
                    className="bg-background border border-border/30 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:border-border/60 transition-colors cursor-pointer font-sans"
                  >
                    <option value="updatedAt">{t`Récents`}</option>
                    <option value="createdAt">{t`Création`}</option>
                    <option value="title">{t`Titre A-Z`}</option>
                    <option value="readingTime">{t`Durée`}</option>
                    <option value="likes">{t`Plus aimés`}</option>
                    <option value="reposts">{t`Plus repartagés`}</option>
                    <option value="engagement">{t`Meilleur engagement`}</option>
                  </select>
                  <button
                    onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                    className="p-1.5 rounded-lg bg-background border border-border/30 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title={t`Ordre : ${sortDirection === 'desc' ? t`Décroissant` : t`Croissant`}`}
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 stroke-[1.5]" />
                  </button>

                  <details className="relative">
                    <summary className="list-none flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-border/30 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-sans">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>{t`Filtres`}</span>
                      {[
                        selectedCategory !== 'all',
                        accessFilter !== 'all',
                        period !== '30d',
                      ].filter(Boolean).length > 0 && (
                        <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                          {
                            [
                              selectedCategory !== 'all',
                              accessFilter !== 'all',
                              period !== '30d',
                            ].filter(Boolean).length
                          }
                        </span>
                      )}
                    </summary>
                    <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-xl border border-border/40 bg-card p-3 shadow-xl space-y-3">
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full bg-background border border-border/30 rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                      >
                        <option value="all">{t`Toutes les catégories`}</option>
                        {uncategorizedCount > 0 && (
                          <option value="uncategorized">
                            {t`Non catégorisé`} ({uncategorizedCount})
                          </option>
                        )}
                        {rootCategories.map((root) => {
                          const subs = categories.filter((c) => c.parentId === root.id);
                          return (
                            <React.Fragment key={root.id}>
                              <option value={root.id}>
                                {root.name?.trim() || root.slug} ({root._count.articles})
                              </option>
                              {subs.map((sub) => (
                                <option key={sub.id} value={sub.id}>
                                  ↳ {sub.name?.trim() || sub.slug} ({sub._count.articles})
                                </option>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </select>
                      <select
                        value={accessFilter}
                        onChange={(e) => setAccessFilter(e.target.value as AccessFilter)}
                        className="w-full bg-background border border-border/30 rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                      >
                        <option value="all">{t`Tous les accès`}</option>
                        <option value="free">{t`Gratuits`}</option>
                        <option value="premium">{t`Premium Paywall`}</option>
                      </select>
                      <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value as '7d' | '30d' | '90d' | 'all')}
                        className="w-full bg-background border border-border/30 rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                        title={t`Période des vues`}
                      >
                        <option value="7d">{t`Vues sur 7 jours`}</option>
                        <option value="30d">{t`Vues sur 30 jours`}</option>
                        <option value="90d">{t`Vues sur 90 jours`}</option>
                        <option value="all">{t`Toutes les vues`}</option>
                      </select>
                      {hasActiveFilters && (
                        <button
                          onClick={resetFilters}
                          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                        >
                          <FilterX className="w-3 h-3" />
                          {t`Réinitialiser`}
                        </button>
                      )}
                    </div>
                  </details>

                  <details className="relative">
                    <summary className="list-none flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-border/30 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-sans">
                      <Rows3 className="w-3.5 h-3.5" />
                      <span>{t`Affichage`}</span>
                    </summary>
                    <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-xl border border-border/40 bg-card p-3 shadow-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-foreground">
                          {t`Densité`}
                        </span>
                        <div className="flex rounded-lg border border-border/30 overflow-hidden">
                          {(['comfortable', 'compact'] as const).map((value) => (
                            <button
                              key={value}
                              onClick={() => setDensity(value)}
                              className={cn(
                                'px-2 py-1 text-[10px] font-semibold uppercase transition-colors',
                                density === value
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {value === 'comfortable' ? t`Confort` : t`Compact`}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t`Colonnes`}
                        </p>
                        {(
                          [
                            ['category', t`Catégorie`],
                            ['status', t`Statut`],
                            ['premium', 'Premium'],
                            ['updatedAt', t`Modifié`],
                            ['views', t`Vues`],
                            ['comments', t`Commentaires`],
                          ] as const
                        ).map(([key, label]) => (
                          <label
                            key={key}
                            className="flex items-center gap-2 px-1 py-1 rounded-lg text-xs text-foreground hover:bg-muted/50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={columns[key]}
                              onChange={(event) =>
                                setColumns((prev) => ({ ...prev, [key]: event.target.checked }))
                              }
                              className="w-3.5 h-3.5 rounded border-border/40 text-primary focus:ring-primary"
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="pt-2 border-t border-border/30 space-y-2">
                        <select
                          value=""
                          onChange={(event) => applySavedView(event.target.value)}
                          className="w-full bg-background border border-border/30 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                        >
                          <option value="">{t`Vues sauvegardées…`}</option>
                          {Object.keys(savedViews).map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                          <option value="__save">{t`Enregistrer la vue actuelle…`}</option>
                        </select>
                        <div className="flex items-center gap-2">
                          {Object.keys(savedViews).length > 0 && (
                            <select
                              value=""
                              onChange={(event) => {
                                if (event.target.value) deleteSavedView(event.target.value);
                              }}
                              className="flex-1 bg-background border border-border/30 rounded-lg px-2 py-1.5 text-xs text-muted-foreground focus:outline-none"
                            >
                              <option value="">{t`Supprimer une vue…`}</option>
                              {Object.keys(savedViews).map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            onClick={saveCurrentView}
                            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {t`Sauver`}
                          </button>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            </div>

            {/* Sélection & actions groupées */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <label className="flex items-center gap-2 text-xs text-muted-foreground font-sans cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={
                    filteredAndSortedArticles.length > 0 &&
                    filteredAndSortedArticles.every((art) => selectedIds.has(art.id))
                  }
                  onChange={(event) => {
                    if (event.target.checked) {
                      setSelectedIds(new Set(filteredAndSortedArticles.map((art) => art.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-border/40 text-primary focus:ring-primary"
                />
                {t`Tout sélectionner`} ({filteredAndSortedArticles.length})
              </label>
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {selectedIds.size} {t`sélectionné(s)`}
                  </span>
                  <button
                    onClick={() => setBulkSettingsOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-semibold hover:bg-primary/20 transition-colors"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    {t`Modifier les paramètres`}
                  </button>
                  {selectedIds.size === 1 &&
                    (() => {
                      const selected = articles.find((art) => selectedIds.has(art.id));
                      if (!selected) return null;
                      return (
                        <button
                          onClick={() => requestTogglePin(selected.id, selected.title)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-foreground border border-border/40 text-xs font-semibold hover:bg-muted/80 transition-colors"
                        >
                          <Pin className="w-3 h-3" />
                          {pinnedArticleId === selected.id ? t`Dépingler` : t`Épingler`}
                        </button>
                      );
                    })()}
                  <button
                    onClick={requestBulkDelete}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs font-semibold hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t`Supprimer`}
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t`Annuler`}
                  </button>
                </div>
              )}
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
                {filteredAndSortedArticles.map((art) => (
                  <ArticleListRow
                    key={art.id}
                    article={art}
                    columns={columns}
                    density={density}
                    selected={selectedIds.has(art.id)}
                    pinned={
                      Boolean((art as unknown as { isPinned?: boolean }).isPinned) ||
                      pinnedArticleId === art.id
                    }
                    about={isAboutArticle(art, aboutArticleId)}
                    canReview={canReview}
                    onToggleSelect={toggleSelected}
                    onOpenAnalytics={(article) =>
                      setInspectingArticle({ id: article.id, slug: article.slug })
                    }
                    onTogglePin={(article) => requestTogglePin(article.id, article.title)}
                    onOpenSettings={setSettingsArticleId}
                    onToggleAbout={handleToggleAbout}
                    onReview={(article, approve) =>
                      requestReview(article.id, approve, article.title)
                    }
                    onDelete={(article) => requestDeleteArticle(article.id, article.title)}
                    onOpenDiff={handleOpenDiff}
                  />
                ))}
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
            <div className="md:col-span-2 space-y-4 select-none">
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

              {/* Badge flottant qui suit le pointeur de souris lors du Drag (sans aucun décalage de page) */}
              {draggedCat && pointerPos && (
                <div
                  style={{
                    position: 'fixed',
                    left: pointerPos.x + 14,
                    top: pointerPos.y + 14,
                    pointerEvents: 'none',
                    zIndex: 9999,
                  }}
                  className="bg-primary text-primary-foreground font-sans text-xs font-semibold px-3 py-1.5 rounded-lg shadow-2xl flex items-center gap-2 border border-primary-foreground/20 backdrop-blur-md select-none transition-transform pointer-events-none"
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
                                {root.name?.trim() || root.slug}
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
                            {root.isDefault ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/60 text-[10px] font-semibold text-muted-foreground"
                                title={t`Catégorie technique non supprimable, masquée de la navigation publique`}
                              >
                                <Lock className="w-3 h-3" />
                                {t`Par défaut`}
                              </span>
                            ) : (
                              <>
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
                              </>
                            )}
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
                                  {sub.name?.trim() || sub.slug}
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

                  {/* Zone de largage pour promouvoir en catégorie racine (en bas de liste, zéro décalage en haut) */}
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
                      <ArrowUpRight className="w-4 h-4 text-primary" />
                      {t`Déposer ici pour promouvoir en catégorie principale`}
                    </div>
                  )}

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

      {settingsArticleId && (
        <ArticleSettingsSheet
          articleId={settingsArticleId}
          categories={categories}
          canPublish={canPublish}
          onClose={closeArticleSettings}
          onSaved={refreshArticles}
          onRequestConfirm={requestConfirm}
        />
      )}

      <ArticleBulkSettingsDialog
        open={bulkSettingsOpen}
        onOpenChange={setBulkSettingsOpen}
        selectedIds={Array.from(selectedIds)}
        selectedCount={selectedIds.size}
        categories={categories}
        onApplied={async () => {
          setSelectedIds(new Set());
          await refreshArticles();
        }}
        onRequestConfirm={requestConfirm}
      />

      <ConfirmActionDialog action={confirmAction} onClose={() => setConfirmAction(null)} />

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

      {/* Article Diff Modal — Comparaison version en ligne vs brouillon */}
      {diffTarget && (
        <ArticleDiffModal
          open={Boolean(diffTarget)}
          onClose={() => setDiffTarget(null)}
          articleTitle={diffTarget.article.title}
          draftTitle={diffTarget.draftTitle}
          liveContent={diffTarget.liveContent}
          draftContent={diffTarget.draftContent}
          isPublished={diffTarget.article.published}
          canReview={canReview}
          status={diffTarget.article.status}
          onApprove={() => handleReview(diffTarget.article.id, true)}
          onReject={(comment) => handleReview(diffTarget.article.id, false, comment)}
          onDiscardDraft={() => handleDiscardDraft(diffTarget.article.id)}
          onEdit={() => router.push(`/articles/${diffTarget.article.id}`)}
        />
      )}
    </div>
  );
}
