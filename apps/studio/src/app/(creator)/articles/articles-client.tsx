'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRightLeft,
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
import { Button, buttonClasses } from '@qoe/ui/button';
import { Checkbox } from '@qoe/ui/checkbox';
import { Dropdown } from '@qoe/ui/dropdown';
import { Input, InputGroup, Textarea } from '@qoe/ui/input';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import {
  StudioField,
  StudioHeader,
  StudioPage,
  StudioRowList,
  StudioSection,
} from '@/components/studio-page';
import { Select } from '@qoe/ui/select';
import { t } from '@lingui/core/macro';

import { ArticleInspectorDrawer } from '../analytics/components/ArticleInspectorModal';
import { ArticleBulkSettingsDialog } from './components/article-bulk-settings-dialog';
import { ArticleBulkTransferDialog } from './components/article-bulk-transfer-dialog';
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
  /** Utilisateur courant : seul l'auteur pilote la visibilité sur son profil personnel. */
  currentUserId?: string | null;
}

export function ArticlesClient({
  initialArticles,
  initialCategories,
  initialPinnedArticleId = null,
  initialAboutArticleId = null,
  initialTab = 'articles',
  canReview = false,
  canPublish = false,
  currentUserId = null,
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
  const [bulkTransferOpen, setBulkTransferOpen] = useState(false);

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
      // Un article programmé n'est ni publié ni brouillon : il a son propre
      // onglet, sinon il se cacherait dans « Brouillons » alors qu'il partira
      // tout seul à la date prévue.
      if (statusFilter === 'published' && !art.published) return false;
      if (statusFilter === 'scheduled' && art.status !== 'SCHEDULED') return false;
      if (
        statusFilter === 'draft' &&
        (art.published || art.status === 'SUBMITTED' || art.status === 'SCHEDULED')
      )
        return false;
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
  const countScheduled = articles.filter((a) => a.status === 'SCHEDULED').length;
  const countDrafts = articles.filter(
    (a) => !a.published && a.status !== 'SUBMITTED' && a.status !== 'SCHEDULED'
  ).length;
  const countReview = articles.filter((a) => a.status === 'SUBMITTED').length;

  return (
    <StudioPage className="pb-16">
      <StudioHeader
        title={t`Articles`}
        description={t`Gérez les écrits et les catégories de la publication.`}
        actions={
          <>
            {(() => {
              const targetAbout = articles.find((a) => isAboutArticle(a, aboutArticleId));
              return (
                <a
                  href={
                    targetAbout
                      ? `/articles/${targetAbout.id}`
                      : `/articles/new?slug=${ABOUT_ARTICLE_SLUG}&title=%C3%80%20propos`
                  }
                  className={buttonClasses({ variant: 'outline', size: 'sm' })}
                  title={t`Rédiger ou modifier la page À propos de la publication`}
                >
                  <BookOpen />
                  <span>{t`Page À propos`}</span>
                </a>
              );
            })()}

            <Tabs
              variant="segmented"
              size="sm"
              value={activeMainTab}
              onValueChange={(value) => setActiveMainTab(value as 'articles' | 'categories')}
            >
              <TabList aria-label={t`Sections des articles`}>
                <Tab id="articles">
                  {t`Écrits`} ({articles.length})
                </Tab>
                <Tab id="categories">
                  {t`Catégories`} ({categories.length})
                </Tab>
              </TabList>
            </Tabs>
          </>
        }
      />

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
            <InputGroup left={<Search className="size-4 stroke-[1.5]" />} className="max-w-md">
              <Input
                type="text"
                size="sm"
                placeholder={t`Rechercher un écrit par titre ou slug…`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </InputGroup>

            {/* Barre de contrôle épurée : tri + filtres + affichage */}
            <div className="flex flex-col gap-3 pb-2 border-b border-border/30">
              <div className="flex flex-wrap items-center gap-2">
                <Tabs
                  variant="underline"
                  size="sm"
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as StatusFilter)}
                >
                  <TabList aria-label={t`Filtrer par statut`}>
                    {(
                      [
                        ['all', t`Tous`, articles.length],
                        ['published', t`Publiés`, countPublished],
                        ...(countScheduled > 0
                          ? ([['scheduled', t`Programmés`, countScheduled]] as const)
                          : []),
                        ['draft', t`Brouillons`, countDrafts],
                        ...(canReview && countReview > 0
                          ? ([['review', t`En revue`, countReview]] as const)
                          : []),
                      ] as const
                    ).map(([value, label, count]) => (
                      <Tab key={value} id={value}>
                        {label} ({count})
                      </Tab>
                    ))}
                  </TabList>
                </Tabs>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Select
                    label={t`Trier par`}
                    hideLabel
                    size="sm"
                    className="w-40"
                    value={sortField}
                    onValueChange={(value) => setSortField(value as SortField)}
                    options={[
                      { id: 'updatedAt', label: t`Récents` },
                      { id: 'createdAt', label: t`Création` },
                      { id: 'title', label: t`Titre A-Z` },
                      { id: 'readingTime', label: t`Durée` },
                      { id: 'likes', label: t`Plus aimés` },
                      { id: 'reposts', label: t`Plus repartagés` },
                      { id: 'engagement', label: t`Meilleur engagement` },
                    ]}
                  />
                  <Button
                    variant="outline"
                    size="xs"
                    shape="icon"
                    onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                    title={t`Ordre : ${sortDirection === 'desc' ? t`Décroissant` : t`Croissant`}`}
                    aria-label={t`Inverser l'ordre de tri`}
                  >
                    <ArrowUpDown />
                  </Button>

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
                      <Select
                        label={t`Catégorie`}
                        hideLabel
                        size="sm"
                        value={selectedCategory}
                        onValueChange={setSelectedCategory}
                        options={[
                          { id: 'all', label: t`Toutes les catégories` },
                          ...(uncategorizedCount > 0
                            ? [
                                {
                                  id: 'uncategorized',
                                  label: `${t`Non catégorisé`} (${uncategorizedCount})`,
                                },
                              ]
                            : []),
                          ...rootCategories.flatMap((root) => [
                            {
                              id: root.id,
                              label: `${root.name?.trim() || root.slug} (${root._count.articles})`,
                            },
                            ...categories
                              .filter((category) => category.parentId === root.id)
                              .map((sub) => ({
                                id: sub.id,
                                label: `↳ ${sub.name?.trim() || sub.slug} (${sub._count.articles})`,
                              })),
                          ]),
                        ]}
                      />
                      <Select
                        label={t`Accès`}
                        hideLabel
                        size="sm"
                        value={accessFilter}
                        onValueChange={(value) => setAccessFilter(value as AccessFilter)}
                        options={[
                          { id: 'all', label: t`Tous les accès` },
                          { id: 'free', label: t`Gratuits` },
                          { id: 'premium', label: t`Premium Paywall` },
                        ]}
                      />
                      <Select
                        label={t`Période des vues`}
                        hideLabel
                        size="sm"
                        value={period}
                        onValueChange={(value) => setPeriod(value as '7d' | '30d' | '90d' | 'all')}
                        options={[
                          { id: '7d', label: t`Vues sur 7 jours` },
                          { id: '30d', label: t`Vues sur 30 jours` },
                          { id: '90d', label: t`Vues sur 90 jours` },
                          { id: 'all', label: t`Toutes les vues` },
                        ]}
                      />
                      {hasActiveFilters && (
                        <Button variant="soft" tone="danger" size="xs" block onClick={resetFilters}>
                          <FilterX />
                          {t`Réinitialiser`}
                        </Button>
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
                        <div className="flex items-center gap-1">
                          {(['comfortable', 'compact'] as const).map((value) => (
                            <Button
                              key={value}
                              type="button"
                              variant={density === value ? 'soft' : 'ghost'}
                              tone={density === value ? 'brand' : 'neutral'}
                              size="xs"
                              onClick={() => setDensity(value)}
                            >
                              {value === 'comfortable' ? t`Confort` : t`Compact`}
                            </Button>
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
                          <Checkbox
                            key={key}
                            size="sm"
                            isSelected={columns[key]}
                            onChange={(selected) =>
                              setColumns((prev) => ({ ...prev, [key]: selected }))
                            }
                            label={<span className="text-xs text-foreground">{label}</span>}
                            className="w-full px-1 py-1 hover:bg-muted/50"
                          />
                        ))}
                      </div>
                      <div className="pt-2 border-t border-border/30 space-y-2">
                        <Dropdown
                          label={t`Vues sauvegardées`}
                          ariaLabel={t`Vues sauvegardées`}
                          size="sm"
                          className="w-full justify-between"
                          items={[
                            ...Object.keys(savedViews).map((name) => ({
                              id: name,
                              label: name,
                              onAction: () => applySavedView(name),
                            })),
                            {
                              id: '__save',
                              label: t`Enregistrer la vue actuelle…`,
                              onAction: saveCurrentView,
                            },
                          ]}
                        />
                        <div className="flex items-center gap-2">
                          {Object.keys(savedViews).length > 0 && (
                            <Dropdown
                              label={t`Supprimer une vue`}
                              ariaLabel={t`Supprimer une vue sauvegardée`}
                              size="sm"
                              tone="danger"
                              variant="ghost"
                              className="flex-1 justify-between"
                              items={Object.keys(savedViews).map((name) => ({
                                id: name,
                                label: name,
                                tone: 'danger' as const,
                                onAction: () => deleteSavedView(name),
                              }))}
                            />
                          )}
                          <Button size="sm" variant="ghost" tone="brand" onClick={saveCurrentView}>
                            <Save />
                            {t`Sauver`}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            </div>

            {/* Sélection & actions groupées */}
            <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <Checkbox
                size="sm"
                isSelected={
                  filteredAndSortedArticles.length > 0 &&
                  filteredAndSortedArticles.every((art) => selectedIds.has(art.id))
                }
                onChange={(selected) => {
                  setSelectedIds(
                    selected ? new Set(filteredAndSortedArticles.map((art) => art.id)) : new Set()
                  );
                }}
                label={
                  <span className="text-xs text-muted-foreground">
                    {t`Tout sélectionner`} ({filteredAndSortedArticles.length})
                  </span>
                }
              />
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {selectedIds.size} {t`sélectionné(s)`}
                  </span>
                  <Button
                    variant="soft"
                    tone="brand"
                    size="xs"
                    onClick={() => setBulkSettingsOpen(true)}
                  >
                    <SlidersHorizontal />
                    {t`Modifier les paramètres`}
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => setBulkTransferOpen(true)}>
                    <ArrowRightLeft />
                    {t`Transférer…`}
                  </Button>
                  {selectedIds.size === 1 &&
                    (() => {
                      const selected = articles.find((art) => selectedIds.has(art.id));
                      if (!selected) return null;
                      return (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => requestTogglePin(selected.id, selected.title)}
                        >
                          <Pin />
                          {pinnedArticleId === selected.id ? t`Dépingler` : t`Épingler`}
                        </Button>
                      );
                    })()}
                  <Button variant="soft" tone="danger" size="xs" onClick={requestBulkDelete}>
                    <Trash2 />
                    {t`Supprimer`}
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setSelectedIds(new Set())}>
                    {t`Annuler`}
                  </Button>
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
                  <Button variant="soft" size="sm" onClick={resetFilters} className="mt-2">
                    <FilterX />
                    {t`Réinitialiser les filtres`}
                  </Button>
                ) : (
                  <a
                    href="/articles/new"
                    className={buttonClasses({
                      variant: 'solid',
                      tone: 'brand',
                      size: 'sm',
                      className: 'mt-2',
                    })}
                  >
                    <Plus />
                    {t`Rédiger un article`}
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
                    canEditPersonalProfile={Boolean(
                      currentUserId && art.authorId === currentUserId
                    )}
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
            className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-3"
          >
            {/* Left: Categories hierarchy & Drag and Drop zone */}
            <div className="select-none md:col-span-2">
              <StudioSection title={t`Arborescence`} icon={FolderTree}>
                <p className="mb-4 text-xs text-muted-foreground">
                  {t`Glissez-déposez une catégorie pour la déplacer, ou utilisez les actions de chaque ligne.`}
                </p>

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
                  <div className="py-12 text-center">
                    <FolderTree
                      className="mx-auto h-5 w-5 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    <p className="mt-3 text-sm font-medium text-foreground">
                      {t`Aucune catégorie pour le moment`}
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                      {t`Organisez vos articles avec des thématiques claires et des sous-catégories à 2 niveaux.`}
                    </p>

                    {isCreatingInlineRoot ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleInlineCreateRoot();
                        }}
                        className="mx-auto mt-4 flex w-full max-w-md items-center gap-2"
                      >
                        <Input
                          autoFocus
                          size="sm"
                          value={inlineRootName}
                          onChange={(e) => setInlineRootName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setIsCreatingInlineRoot(false);
                          }}
                          placeholder={t`Nom de la catégorie principale... (Entrée)`}
                          className="flex-1"
                        />
                        <Button
                          type="submit"
                          variant="solid"
                          tone="brand"
                          size="sm"
                          disabled={isCreatingInline || !inlineRootName.trim()}
                        >
                          {isCreatingInline ? t`...` : t`Créer`}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          shape="icon"
                          onClick={() => setIsCreatingInlineRoot(false)}
                          aria-label={t`Annuler`}
                        >
                          <X />
                        </Button>
                      </form>
                    ) : (
                      <Button
                        type="button"
                        variant="solid"
                        tone="brand"
                        size="sm"
                        className="mt-4"
                        onClick={() => {
                          setIsCreatingInlineRoot(true);
                          setInlineRootName('');
                        }}
                      >
                        <Plus />
                        {t`Créer votre première catégorie`}
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <StudioRowList>
                      {rootCategories.map((root) => {
                        const subCategories = categories.filter((c) => c.parentId === root.id);
                        const totalArticles =
                          root._count.articles +
                          subCategories.reduce((acc, s) => acc + s._count.articles, 0);

                        const isDropTarget = dragOverParentId === root.id;

                        return (
                          <div
                            key={root.id}
                            data-category-drop-id={root.id}
                            className={cn(
                              'py-4 transition-colors first:pt-0 last:pb-0',
                              isDropTarget || editingCat?.id === root.id ? 'bg-primary/5' : ''
                            )}
                          >
                            {/* Root Category Header Row */}
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                {/* Drag Handle */}
                                <div
                                  onPointerDown={(e) => {
                                    if (!hasChildren(root.id)) {
                                      handlePointerDown(e, root.id);
                                    }
                                  }}
                                  className={cn(
                                    'shrink-0 touch-none select-none rounded p-1 text-muted-foreground/60 transition-colors',
                                    hasChildren(root.id)
                                      ? 'cursor-not-allowed opacity-30'
                                      : 'cursor-grab hover:text-foreground active:cursor-grabbing'
                                  )}
                                  title={
                                    hasChildren(root.id)
                                      ? t`Une catégorie mère avec des sous-catégories ne peut pas devenir sous-catégorie.`
                                      : t`Glisser pour déplacer`
                                  }
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </div>

                                <FolderOpen
                                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                  strokeWidth={1.5}
                                />

                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="truncate text-sm font-medium text-foreground">
                                    {root.name?.trim() || root.slug}
                                  </span>
                                  <span className="text-[11px] tabular-nums text-muted-foreground">
                                    {totalArticles} {totalArticles > 1 ? t`articles` : t`article`}
                                  </span>
                                  {subCategories.length > 0 && (
                                    <span className="text-[11px] text-muted-foreground">
                                      {subCategories.length}{' '}
                                      {subCategories.length > 1
                                        ? t`sous-catégories`
                                        : t`sous-catégorie`}
                                    </span>
                                  )}
                                  <span className="font-mono text-[10px] text-muted-foreground/70">
                                    /{root.slug}
                                  </span>
                                  {root.isDefault && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                                      title={t`Catégorie technique non supprimable, masquée de la navigation publique`}
                                    >
                                      <Lock className="h-3 w-3" />
                                      {t`Par défaut`}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Quick Actions */}
                              <div className="flex shrink-0 items-center gap-0.5">
                                {/* Bouton déplacement 1 clic si pas d'enfants */}
                                {!hasChildren(root.id) && (
                                  <div className="relative">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      shape="icon"
                                      onClick={() =>
                                        setMovingCatId(movingCatId === root.id ? null : root.id)
                                      }
                                      title={t`Déplacer sous une autre catégorie (1 clic)`}
                                      aria-label={t`Déplacer sous une autre catégorie`}
                                    >
                                      <FolderInput />
                                    </Button>
                                    {movingCatId === root.id && (
                                      <div className="absolute right-0 top-full z-40 mt-1 w-52 space-y-0.5 rounded-xl border border-border/60 bg-card p-1.5 text-xs shadow-xl">
                                        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                          {t`Déplacer sous...`}
                                        </p>
                                        {rootCategories
                                          .filter((r) => r.id !== root.id)
                                          .map((r) => (
                                            <Button
                                              key={r.id}
                                              type="button"
                                              variant="ghost"
                                              size="xs"
                                              className="w-full justify-start gap-2 font-normal"
                                              onClick={async () => {
                                                setMovingCatId(null);
                                                await handleDropOnParent(r.id, root.id);
                                              }}
                                            >
                                              <FolderOpen className="shrink-0 text-muted-foreground" />
                                              <span className="truncate">{r.name}</span>
                                            </Button>
                                          ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  shape="icon"
                                  onClick={() => {
                                    setInlineCreatingParentId(root.id);
                                    setInlineSubName('');
                                  }}
                                  title={t`Ajouter une sous-catégorie directement`}
                                  aria-label={t`Ajouter une sous-catégorie`}
                                >
                                  <Plus />
                                </Button>
                                {!root.isDefault && (
                                  <>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      shape="icon"
                                      onClick={() => handleOpenEdit(root)}
                                      title={t`Modifier`}
                                      aria-label={t`Modifier la catégorie`}
                                    >
                                      <Edit3 />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      shape="icon"
                                      onClick={() => handleDeleteCategory(root.id, root.name)}
                                      title={t`Supprimer`}
                                      aria-label={t`Supprimer la catégorie`}
                                      className="hover:text-destructive-text"
                                    >
                                      <Trash2 />
                                    </Button>
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
                              <p className="mt-1 flex items-center gap-1.5 pl-8 text-xs font-medium text-primary">
                                <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
                                {t`Déposer ici pour ajouter en sous-catégorie de "${root.name}"`}
                              </p>
                            )}

                            {/* Nested Sub-Categories + Live Ghost Preview + Inline Quick Create */}
                            <div className="mt-2 ml-4 border-l border-border/40 pl-4">
                              {subCategories.map((sub) => (
                                <div
                                  key={sub.id}
                                  onPointerDown={(e) => handlePointerDown(e, sub.id)}
                                  className={cn(
                                    'flex cursor-grab touch-none select-none items-center justify-between gap-3 border-b border-border/30 py-2 active:cursor-grabbing',
                                    draggedId === sub.id && 'opacity-40'
                                  )}
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                                    <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                                    <span className="truncate text-xs font-medium text-foreground">
                                      {sub.name?.trim() || sub.slug}
                                    </span>
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {sub._count.articles}{' '}
                                      {sub._count.articles > 1 ? t`articles` : t`article`}
                                    </span>
                                    <span className="font-mono text-[10px] text-muted-foreground/70">
                                      /{sub.slug}
                                    </span>
                                  </div>

                                  <div className="flex shrink-0 items-center gap-0.5">
                                    {/* Menu rapide Déplacer vers... */}
                                    <div className="relative">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="xs"
                                        shape="icon"
                                        onClick={() =>
                                          setMovingCatId(movingCatId === sub.id ? null : sub.id)
                                        }
                                        title={t`Déplacer vers... (1 clic)`}
                                        aria-label={t`Déplacer la catégorie`}
                                      >
                                        <FolderInput />
                                      </Button>
                                      {movingCatId === sub.id && (
                                        <div className="absolute right-0 top-full z-40 mt-1 w-52 space-y-0.5 rounded-xl border border-border/60 bg-card p-1.5 text-xs shadow-xl">
                                          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            {t`Déplacer vers...`}
                                          </p>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="xs"
                                            className="w-full justify-start gap-2 font-normal"
                                            onClick={async () => {
                                              setMovingCatId(null);
                                              await handleDropOnRoot(sub.id);
                                            }}
                                          >
                                            <ArrowUpRight className="shrink-0 text-muted-foreground" />
                                            <span>{t`Catégorie principale`}</span>
                                          </Button>
                                          {rootCategories
                                            .filter((r) => r.id !== sub.parentId)
                                            .map((r) => (
                                              <Button
                                                key={r.id}
                                                type="button"
                                                variant="ghost"
                                                size="xs"
                                                className="w-full justify-start gap-2 font-normal"
                                                onClick={async () => {
                                                  setMovingCatId(null);
                                                  await handleDropOnParent(r.id, sub.id);
                                                }}
                                              >
                                                <FolderOpen className="shrink-0 text-muted-foreground" />
                                                <span className="truncate">{r.name}</span>
                                              </Button>
                                            ))}
                                        </div>
                                      )}
                                    </div>

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      shape="icon"
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
                                      title={t`Promouvoir en catégorie principale`}
                                      aria-label={t`Promouvoir en catégorie principale`}
                                    >
                                      <ArrowUpRight />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      shape="icon"
                                      onClick={() => handleOpenEdit(sub)}
                                      title={t`Modifier`}
                                      aria-label={t`Modifier la catégorie`}
                                    >
                                      <Edit3 />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      shape="icon"
                                      onClick={() => handleDeleteCategory(sub.id, sub.name)}
                                      title={t`Supprimer`}
                                      aria-label={t`Supprimer la catégorie`}
                                      className="hover:text-destructive-text"
                                    >
                                      <Trash2 />
                                    </Button>
                                  </div>
                                </div>
                              ))}

                              {/* Live Insertion Ghost Preview during Drag */}
                              {isDropTarget && draggedCat && (
                                <p className="flex items-center gap-2 py-2 text-xs font-medium text-primary">
                                  <CornerDownRight className="h-3.5 w-3.5 shrink-0" />↳{' '}
                                  {draggedCat.name}
                                </p>
                              )}

                              {/* Inline Sub-Category Creation Form */}
                              {inlineCreatingParentId === root.id ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    handleInlineCreateSubCategory(root.id);
                                  }}
                                  className="flex items-center gap-2 py-2"
                                >
                                  <Input
                                    autoFocus
                                    size="sm"
                                    value={inlineSubName}
                                    onChange={(e) => setInlineSubName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') setInlineCreatingParentId(null);
                                    }}
                                    placeholder={t`Nom de la sous-catégorie... (Entrée)`}
                                    className="flex-1"
                                  />
                                  <Button
                                    type="submit"
                                    variant="solid"
                                    tone="brand"
                                    size="sm"
                                    disabled={isCreatingInline || !inlineSubName.trim()}
                                  >
                                    {isCreatingInline ? t`...` : t`Créer`}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    shape="icon"
                                    onClick={() => setInlineCreatingParentId(null)}
                                    aria-label={t`Annuler`}
                                  >
                                    <X />
                                  </Button>
                                </form>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  className="mt-1 text-muted-foreground"
                                  onClick={() => {
                                    setInlineCreatingParentId(root.id);
                                    setInlineSubName('');
                                  }}
                                >
                                  <Plus />
                                  {t`Ajouter une sous-catégorie`}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </StudioRowList>

                    {/* Zone de largage pour promouvoir en catégorie racine */}
                    {draggedCat?.parentId && (
                      <div
                        data-drop-zone="root"
                        onClick={() => handleDropOnRoot(draggedCat.id)}
                        className={cn(
                          'mt-2 flex cursor-pointer items-center justify-center gap-2 border-t border-dashed py-3 text-xs font-medium transition-colors',
                          dragOverRoot
                            ? 'border-primary text-primary'
                            : 'border-border/60 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
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
                        className="mt-3 flex items-center gap-2 border-t border-border/40 pt-3"
                      >
                        <Input
                          autoFocus
                          size="sm"
                          value={inlineRootName}
                          onChange={(e) => setInlineRootName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setIsCreatingInlineRoot(false);
                          }}
                          placeholder={t`Nom de la catégorie principale... (Entrée pour valider)`}
                          className="flex-1"
                        />
                        <Button
                          type="submit"
                          variant="solid"
                          tone="brand"
                          size="sm"
                          disabled={isCreatingInline || !inlineRootName.trim()}
                        >
                          {isCreatingInline ? t`...` : t`Créer`}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          shape="icon"
                          onClick={() => setIsCreatingInlineRoot(false)}
                          aria-label={t`Annuler`}
                        >
                          <X />
                        </Button>
                      </form>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setIsCreatingInlineRoot(true);
                          setInlineRootName('');
                        }}
                      >
                        <Plus />
                        {t`Nouvelle catégorie principale`}
                      </Button>
                    )}
                  </>
                )}
              </StudioSection>
            </div>

            {/* Right Panel: Contextual Category Editor */}
            <div className="md:col-span-1">
              <div className="sticky top-6">
                {editingCat ? (
                  <StudioSection
                    title={t`Modifier la catégorie`}
                    icon={FolderTree}
                    actions={
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        shape="icon"
                        onClick={() => setEditingCat(null)}
                        title={t`Fermer`}
                        aria-label={t`Fermer`}
                      >
                        <X />
                      </Button>
                    }
                  >
                    <p className="mb-4 truncate text-xs text-muted-foreground">{editingCat.name}</p>

                    <form onSubmit={handleSaveEdit} className="space-y-4">
                      <StudioField label={t`Nom de la catégorie`} htmlFor="category-name">
                        <Input
                          id="category-name"
                          size="sm"
                          value={editCatName}
                          onChange={(e) => setEditCatName(e.target.value)}
                          required
                        />
                      </StudioField>

                      <StudioField
                        label={t`Catégorie parente`}
                        hint={
                          hasChildren(editingCat.id)
                            ? t`Cette catégorie possède déjà des sous-catégories et doit rester une catégorie principale.`
                            : undefined
                        }
                      >
                        <Select
                          label={t`Catégorie parente`}
                          hideLabel
                          size="sm"
                          value={editCatParentId}
                          onValueChange={setEditCatParentId}
                          disabled={hasChildren(editingCat.id)}
                          options={[
                            { id: '', label: t`Aucune (catégorie principale)` },
                            ...rootCategories
                              .filter((rc) => rc.id !== editingCat.id)
                              .map((rc) => ({ id: rc.id, label: rc.name })),
                          ]}
                        />
                      </StudioField>

                      <StudioField label={t`Slug URL`} htmlFor="category-slug">
                        <Input
                          id="category-slug"
                          size="sm"
                          value={editCatSlug}
                          onChange={(e) =>
                            setEditCatSlug(
                              e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
                            )
                          }
                          required
                          className="font-mono text-muted-foreground"
                        />
                      </StudioField>

                      <StudioField label={t`Description`} htmlFor="category-description">
                        <Textarea
                          id="category-description"
                          rows={3}
                          size="sm"
                          value={editCatDesc}
                          onChange={(e) => setEditCatDesc(e.target.value)}
                          placeholder={t`Courte description thématique...`}
                        />
                      </StudioField>

                      {editError && (
                        <p className="flex items-start gap-2 text-xs text-destructive-text">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{editError}</span>
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingCat(null)}
                        >
                          {t`Annuler`}
                        </Button>
                        <Button
                          type="submit"
                          variant="solid"
                          tone="brand"
                          size="sm"
                          disabled={isSavingEdit || !editCatName.trim()}
                        >
                          {isSavingEdit ? t`Enregistrement...` : t`Enregistrer`}
                        </Button>
                      </div>
                    </form>
                  </StudioSection>
                ) : (
                  <StudioSection title={t`Gestion des catégories`} icon={FolderTree}>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t`Sélectionnez une catégorie pour la modifier ici, sans quitter la page.`}
                    </p>
                    <div className="mt-4 space-y-2 border-t border-border/40 pt-4 text-xs text-muted-foreground">
                      <p className="flex items-start gap-2">
                        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{t`Glissez et déposez une catégorie pour la convertir en sous-catégorie.`}</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{t`Cliquez sur « + » depuis une ligne pour ajouter une sous-catégorie.`}</span>
                      </p>
                    </div>
                  </StudioSection>
                )}
              </div>
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

      <ArticleBulkTransferDialog
        open={bulkTransferOpen}
        onOpenChange={setBulkTransferOpen}
        selectedIds={Array.from(selectedIds)}
        selectedCount={selectedIds.size}
        onApplied={async () => {
          setSelectedIds(new Set());
          await refreshArticles();
        }}
      />

      <ConfirmActionDialog action={confirmAction} onClose={() => setConfirmAction(null)} />

      {/* Article Inspector Drawer Modal — période synchronisée avec la liste, toutes les données envoyées */}
      {inspectingArticle && (
        <ArticleInspectorDrawer
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
    </StudioPage>
  );
}
