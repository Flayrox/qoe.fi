import React, { useMemo } from 'react';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  FolderTree,
  CornerDownRight,
  ExternalLink,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  FileText,
  Shield,
  Home,
  Mail,
  Compass,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { isReservedTenantRoute } from '@qoe/config';
import type { CreatorProfile, ClientCategory, ClientNavigationItem } from '../types';

interface NavigationTabProps {
  current: CreatorProfile;
  setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>;
  removeNavigationLink: (idx: number) => void;
  reorderNavigationLink: (idx: number, direction: 'up' | 'down') => void;
  hasUnsavedChanges: boolean;
}

export function NavigationTab({
  current,
  setCurrent,
  removeNavigationLink,
  hasUnsavedChanges,
}: NavigationTabProps) {
  // Quitter les réglages pour Articles abandonne les modifications non
  // enregistrées : on demande confirmation avant de suivre le lien.
  const guardUnsavedNavigation = (e: React.MouseEvent) => {
    if (
      hasUnsavedChanges &&
      !window.confirm('Des modifications ne sont pas enregistrées. Quitter sans enregistrer ?')
    ) {
      e.preventDefault();
    }
  };
  // Liste des IDs des catégories masquées du menu de navigation (catégories seules)
  const hiddenNavCategoryIds =
    (current.siteOptions?.hiddenNavCategoryIds as string[] | undefined) || [];
  const categoryById = new Map(current.categories.map((c) => [c.id, c]));

  /** IDs de la catégorie et de toutes ses descendantes (masquage en cascade). */
  const categoryBranchIds = (catId: string) => {
    const ids = new Set([catId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const cat of current.categories) {
        if (cat.parentId && ids.has(cat.parentId) && !ids.has(cat.id)) {
          ids.add(cat.id);
          grew = true;
        }
      }
    }
    return ids;
  };

  /**
   * Une catégorie n'apparaît dans le menu que si elle et tous ses parents sont
   * visibles : masquer un parent masque donc toute sa branche.
   */
  const isEffectivelyHidden = (cat: ClientCategory) => {
    const visited = new Set<string>();
    let cursor: ClientCategory | undefined = cat;
    while (cursor && !visited.has(cursor.id)) {
      if (hiddenNavCategoryIds.includes(cursor.id)) return true;
      visited.add(cursor.id);
      cursor = cursor.parentId ? categoryById.get(cursor.parentId) : undefined;
    }
    return false;
  };

  /** IDs des parents, du plus proche à la racine. */
  const ancestorIds = (catId: string) => {
    const ids = new Set<string>();
    let cursor = categoryById.get(catId)?.parentId;
    while (cursor && !ids.has(cursor)) {
      ids.add(cursor);
      cursor = categoryById.get(cursor)?.parentId;
    }
    return ids;
  };

  const toggleCategoryInNav = (catId: string) => {
    const category = categoryById.get(catId);
    const isHidden = category
      ? isEffectivelyHidden(category)
      : hiddenNavCategoryIds.includes(catId);
    const branch = categoryBranchIds(catId);
    const nextHidden = isHidden
      ? // Réafficher une sous-catégorie réaffiche aussi le chemin qui y mène.
        hiddenNavCategoryIds.filter((id) => !branch.has(id) && !ancestorIds(catId).has(id))
      : Array.from(new Set([...hiddenNavCategoryIds, ...branch]));

    setCurrent((prev) => ({
      ...prev,
      siteOptions: {
        ...(prev.siteOptions || {}),
        hiddenNavCategoryIds: nextHidden,
      },
    }));
  };

  /** Ordonne les catégories parent → enfants pour refléter la hiérarchie réelle. */
  const orderedCategories = (() => {
    const childrenOf = new Map<string | null, ClientCategory[]>();
    for (const cat of current.categories) {
      const parentId = cat.parentId && categoryById.has(cat.parentId) ? cat.parentId : null;
      const siblings = childrenOf.get(parentId) || [];
      siblings.push(cat);
      childrenOf.set(parentId, siblings);
    }

    const ordered: Array<{ cat: ClientCategory; depth: number }> = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const cat of childrenOf.get(parentId) || []) {
        ordered.push({ cat, depth });
        walk(cat.id, depth + 1);
      }
    };
    walk(null, 0);

    // Garde-fou : catégories orphelines ou cycles éventuels.
    for (const cat of current.categories) {
      if (!ordered.some((entry) => entry.cat.id === cat.id)) {
        ordered.push({ cat, depth: 0 });
      }
    }
    return ordered;
  })();

  // Pages de la publication (À propos, Pensées) & Page d'accueil
  const showHomeInNav = (current.siteOptions?.showHomeInNav ?? true) !== false;
  const showAboutInNav = (current.siteOptions?.showAboutInNav ?? true) !== false;
  const showThoughtsInNav = (current.siteOptions?.showThoughtsInNav ?? true) !== false;

  const toggleHomeInNav = () => {
    setCurrent((prev) => ({
      ...prev,
      siteOptions: {
        ...(prev.siteOptions || {}),
        showHomeInNav: !(((prev.siteOptions || {}).showHomeInNav ?? true) !== false),
      },
    }));
  };

  const togglePageInNav = (pageKey: 'showAboutInNav' | 'showThoughtsInNav') => {
    setCurrent((prev) => ({
      ...prev,
      siteOptions: {
        ...(prev.siteOptions || {}),
        [pageKey]: !(((prev.siteOptions || {})[pageKey] ?? true) !== false),
      },
    }));
  };

  // Liens additionnels du créateur (externes, emails ou internes)
  const customLinks = current.navigation.filter((n) => !n.parentId);

  const addCustomLink = () => {
    const newId = `link_${Date.now()}`;
    const newLink: ClientNavigationItem = {
      id: newId,
      label: 'Nouveau lien',
      url: '',
      order: current.navigation.length,
      isExternal: false,
      parentId: null,
    };
    setCurrent((prev) => ({
      ...prev,
      navigation: [...prev.navigation, newLink],
      siteOptions: {
        ...(prev.siteOptions || {}),
        navOrder: [...((prev.siteOptions?.navOrder as string[]) || []), `link:${newId}`],
      },
    }));
  };

  const addCustomEmail = () => {
    const newId = `link_${Date.now()}`;
    const newLink: ClientNavigationItem = {
      id: newId,
      label: 'Contact',
      url: 'mailto:contact@votre-domaine.com',
      order: current.navigation.length,
      isExternal: true,
      parentId: null,
    };
    setCurrent((prev) => ({
      ...prev,
      navigation: [...prev.navigation, newLink],
      siteOptions: {
        ...(prev.siteOptions || {}),
        navOrder: [...((prev.siteOptions?.navOrder as string[]) || []), `link:${newId}`],
      },
    }));
  };

  // ── ORGANISATEUR UNIFIÉ DE LA NAVBAR ──
  const rootCategories = current.categories.filter((c) => !c.parentId);
  const currentNavOrder = (current.siteOptions?.navOrder as string[] | undefined) || [];

  interface UnifiedNavItem {
    key: string;
    id: string;
    type: 'home' | 'category' | 'page' | 'mail' | 'link';
    label: string;
    url: string;
    isVisible: boolean;
    onToggle: () => void;
    subCount?: number;
    canDelete?: boolean;
    onDelete?: () => void;
  }

  const unifiedNavItems = useMemo<UnifiedNavItem[]>(() => {
    const items: UnifiedNavItem[] = [
      {
        key: 'home',
        id: 'home',
        type: 'home',
        label: 'Accueil',
        url: '/',
        isVisible: showHomeInNav,
        onToggle: toggleHomeInNav,
      },
      ...rootCategories.map((cat) => ({
        key: `cat:${cat.id}`,
        id: cat.id,
        type: 'category' as const,
        label: cat.name,
        url: `/${cat.slug}`,
        isVisible: !isEffectivelyHidden(cat),
        onToggle: () => toggleCategoryInNav(cat.id),
        subCount: current.categories.filter((c) => c.parentId === cat.id).length,
      })),
      {
        key: 'page:thoughts',
        id: 'page:thoughts',
        type: 'page',
        label: 'Pensées',
        url: '/thoughts',
        isVisible: showThoughtsInNav,
        onToggle: () => togglePageInNav('showThoughtsInNav'),
      },
      {
        key: 'page:about',
        id: 'page:about',
        type: 'page',
        label: 'À propos',
        url: '/about',
        isVisible: showAboutInNav,
        onToggle: () => togglePageInNav('showAboutInNav'),
      },
      ...customLinks.map((nav, extIdx) => {
        const globalIndex = current.navigation.findIndex((n) => n === nav);
        const linkId = nav.id || `ext-${extIdx}`;
        const isMail = Boolean(
          nav.url &&
          (nav.url.toLowerCase().startsWith('mailto:') ||
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nav.url.trim()))
        );
        return {
          key: `link:${linkId}`,
          id: linkId,
          type: isMail ? ('mail' as const) : ('link' as const),
          label: nav.label || 'Lien sans titre',
          url: nav.url || '',
          isVisible: true,
          onToggle: () => {},
          canDelete: true,
          onDelete: () => removeNavigationLink(globalIndex),
        };
      }),
    ];

    return items.sort((a, b) => {
      const getRank = (item: UnifiedNavItem) => {
        const idx = currentNavOrder.indexOf(item.key);
        if (idx !== -1) return idx;
        const bareKey = item.key.replace(/^(cat|page|link):/, '');
        const altIdx = currentNavOrder.indexOf(bareKey);
        if (altIdx !== -1) return altIdx;
        return 1000 + items.indexOf(item);
      };
      return getRank(a) - getRank(b);
    });
  }, [
    showHomeInNav,
    rootCategories,
    current.categories,
    hiddenNavCategoryIds,
    showThoughtsInNav,
    showAboutInNav,
    customLinks,
    currentNavOrder,
    current.navigation,
  ]);

  const moveUnifiedItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= unifiedNavItems.length) return;

    const reordered = [...unifiedNavItems];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const newNavOrder = reordered.map((item) => item.key);
    setCurrent((prev) => ({
      ...prev,
      siteOptions: {
        ...(prev.siteOptions || {}),
        navOrder: newNavOrder,
      },
    }));
  };

  const visibleNavbarItems = unifiedNavItems.filter((item) => item.isVisible);

  return (
    <div className="max-w-4xl space-y-6">
      {/* ── 0. APERÇU EN DIRECT DE LA BARRE DU HAUT ── */}
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Aperçu en direct de votre menu
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Ordre réel visible par vos lecteurs (de gauche à droite)
          </span>
        </div>

        {visibleNavbarItems.length === 0 ? (
          <div className="py-4 text-center border border-dashed border-border/40 rounded-lg text-xs text-muted-foreground">
            Aucun élément actif dans la barre de navigation. Activez des rubriques ou des pages
            ci-dessous.
          </div>
        ) : (
          <div className="p-3 bg-muted/20 border border-border/40 rounded-xl overflow-x-auto flex items-center gap-2 select-none">
            {visibleNavbarItems.map((item) => (
              <div
                key={item.key}
                className="px-2.5 py-1.5 rounded-lg bg-background border border-border/60 text-xs font-medium text-foreground whitespace-nowrap shadow-2xs flex items-center gap-1.5 shrink-0"
              >
                {item.type === 'home' && <Home className="w-3.5 h-3.5 text-muted-foreground" />}
                {item.type === 'category' && <FolderTree className="w-3.5 h-3.5 text-primary" />}
                {item.type === 'page' && <FileText className="w-3.5 h-3.5 text-muted-foreground" />}
                {item.type === 'mail' && <Mail className="w-3.5 h-3.5 text-primary" />}
                {item.type === 'link' && (
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 1. ORGANISATEUR & ORDRE DE LA NAVBAR ── */}
      <div
        id="navbar-organizer"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/30">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ordre de la barre de navigation
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Déplacez les éléments vers le haut ou vers le bas pour organiser votre menu selon vos
              priorités éditoriales.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {unifiedNavItems.map((item, index) => {
            return (
              <div
                key={item.key}
                className={cn(
                  'flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 bg-muted/20 border border-border/40 rounded-xl transition-all',
                  !item.isVisible && 'opacity-60 bg-muted/10'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* Flèches de réordonnancement global */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveUnifiedItem(index, 'up')}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed rounded transition-colors"
                      title="Déplacer vers la gauche / plus haut"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === unifiedNavItems.length - 1}
                      onClick={() => moveUnifiedItem(index, 'down')}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed rounded transition-colors"
                      title="Déplacer vers la droite / plus bas"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Icône du type */}
                  <div className="p-1.5 rounded-lg bg-muted/60 border border-border/40 text-foreground shrink-0">
                    {item.type === 'home' && <Home className="w-3.5 h-3.5" />}
                    {item.type === 'category' && (
                      <FolderTree className="w-3.5 h-3.5 text-primary" />
                    )}
                    {item.type === 'page' && <FileText className="w-3.5 h-3.5" />}
                    {item.type === 'mail' && <Mail className="w-3.5 h-3.5 text-primary" />}
                    {item.type === 'link' && (
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Intitulé & destination */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {item.label}
                      </span>
                      {item.type === 'home' && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/30">
                          Accueil
                        </span>
                      )}
                      {item.type === 'category' && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                          Rubrique{' '}
                          {item.subCount && item.subCount > 0
                            ? `(${item.subCount} sous-rubriques)`
                            : ''}
                        </span>
                      )}
                      {item.type === 'page' && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/30">
                          Page interne
                        </span>
                      )}
                      {item.type === 'mail' && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                          ✉️ Email direct
                        </span>
                      )}
                      {item.type === 'link' && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/30">
                          Lien externe
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground truncate block">
                      {item.url}
                    </span>
                  </div>
                </div>

                {/* Actions : Visibilité & Suppression pour les liens */}
                <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={item.onToggle}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer',
                      item.isVisible
                        ? 'border-primary/50 bg-primary/10 text-primary shadow-2xs'
                        : 'border-border/40 bg-muted/40 text-muted-foreground hover:text-foreground'
                    )}
                    title={
                      item.isVisible
                        ? 'Visible dans le menu (cliquez pour masquer)'
                        : 'Masqué du menu (cliquez pour afficher)'
                    }
                  >
                    {item.isVisible ? (
                      <>
                        <Eye className="w-3 h-3 text-primary" />
                        <span className="text-[11px]">Dans le menu</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3 opacity-60" />
                        <span className="text-[11px]">Masqué</span>
                      </>
                    )}
                  </button>

                  {item.canDelete && item.onDelete && (
                    <button
                      type="button"
                      onClick={item.onDelete}
                      className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                      title="Supprimer définitivement ce lien"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 2. LIENS PERSONNALISÉS & CONTACT EMAIL ── */}
      <div
        id="links"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/30">
          <div>
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Liens personnalisés & Contact Email
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Ajoutez des raccourcis vers un email de contact (mailto), un podcast, votre boutique
              ou un réseau externe.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={addCustomEmail}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>+ Email / Contact</span>
            </button>
            <button
              type="button"
              onClick={addCustomLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Lien Web</span>
            </button>
          </div>
        </div>

        {customLinks.length === 0 ? (
          <div className="py-6 text-center border border-dashed border-border/40 rounded-lg text-xs text-muted-foreground space-y-2">
            <p>Aucun lien personnalisé ni email de contact configuré.</p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={addCustomEmail}
                className="text-primary hover:underline font-semibold cursor-pointer text-xs"
              >
                Ajouter un email de contact
              </button>
              <span className="text-muted-foreground/40">·</span>
              <button
                type="button"
                onClick={addCustomLink}
                className="text-primary hover:underline font-semibold cursor-pointer text-xs"
              >
                Ajouter un lien web
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {customLinks.map((nav) => {
              const globalIndex = current.navigation.findIndex((n) => n === nav);
              const trimmedUrl = (nav.url || '').trim();
              const isMail =
                trimmedUrl.toLowerCase().startsWith('mailto:') ||
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedUrl);
              const isRawEmail =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedUrl) &&
                !trimmedUrl.toLowerCase().startsWith('mailto:');

              return (
                <div
                  key={globalIndex}
                  className="p-3 bg-muted/20 border border-border/40 rounded-xl space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      type="text"
                      value={nav.label}
                      onChange={(e) => {
                        const updated = [...current.navigation];
                        updated[globalIndex] = { ...updated[globalIndex], label: e.target.value };
                        setCurrent((prev) => ({ ...prev, navigation: updated }));
                      }}
                      placeholder="Intitulé (ex. Contact, Mon Podcast, Boutique...)"
                      className="w-full sm:w-1/3 px-3 py-1.5 bg-background border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                    />

                    <input
                      type="text"
                      value={nav.url || ''}
                      onChange={(e) => {
                        const urlVal = e.target.value;
                        const trimmed = urlVal.trim();
                        const checkMail =
                          trimmed.toLowerCase().startsWith('mailto:') ||
                          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
                        const isExt = Boolean(
                          trimmed &&
                          (trimmed.startsWith('http://') ||
                            trimmed.startsWith('https://') ||
                            trimmed.startsWith('//') ||
                            checkMail)
                        );
                        const updated = [...current.navigation];
                        updated[globalIndex] = {
                          ...updated[globalIndex],
                          url: urlVal,
                          isExternal: isExt,
                        };
                        setCurrent((prev) => ({ ...prev, navigation: updated }));
                      }}
                      placeholder="contact@mondomaine.fr ou https://mon-podcast.com"
                      className="flex-1 px-3 py-1.5 bg-background border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                    />

                    {isMail ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-2 py-1 rounded-md border border-primary/20 shrink-0 select-none">
                        <Mail className="w-3 h-3" />
                        <span>Email direct</span>
                      </span>
                    ) : nav.isExternal ? (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-warning bg-warning/10 px-2 py-1 rounded-md border border-warning/20 shrink-0 select-none"
                        title="Ce lien externe sera sécurisé par la page d'avertissement avant redirection hors de la publication."
                      >
                        <Shield className="w-3 h-3" />
                        <span className="hidden sm:inline">Sortie sécurisée</span>
                      </span>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => removeNavigationLink(globalIndex)}
                      className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer shrink-0 ml-auto"
                      title="Supprimer ce lien"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Suggestion intuitive pour convertir en mailto: */}
                  {isRawEmail && (
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-primary/5 border border-primary/20 rounded-lg">
                      <span className="text-[11px] text-muted-foreground">
                        Adresse email reconnue. Voulez-vous activer le lien direct de messagerie ?
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...current.navigation];
                          updated[globalIndex] = {
                            ...updated[globalIndex],
                            url: `mailto:${trimmedUrl}`,
                            isExternal: true,
                          };
                          setCurrent((prev) => ({ ...prev, navigation: updated }));
                        }}
                        className="text-xs font-semibold text-primary hover:underline cursor-pointer shrink-0"
                      >
                        Formater en mailto:{trimmedUrl}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. CATÉGORIES & SOUS-CATÉGORIES DÉTAILLÉES ── */}
      <div
        id="categories"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/30">
          <div>
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Arborescence des catégories
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Visibilité hiérarchique des rubriques et sous-rubriques. Masquer un parent masque
              aussi l'ensemble de sa branche.
            </p>
          </div>
          <Link
            href="/articles?tab=categories"
            onClick={guardUnsavedNavigation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 text-foreground text-xs font-semibold transition-colors shrink-0"
          >
            Gérer les catégories
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {current.categories.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-border/40 rounded-lg text-xs text-muted-foreground space-y-2">
            <p>Aucune catégorie pour le moment.</p>
            <Link
              href="/articles?tab=categories"
              onClick={guardUnsavedNavigation}
              className="inline-block font-semibold text-primary hover:underline"
            >
              Créer votre première catégorie
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {orderedCategories.map(({ cat, depth }) => {
              const isSubcategory = depth > 0;
              const parent = cat.parentId ? categoryById.get(cat.parentId) : null;
              const isHiddenFromNav = isEffectivelyHidden(cat);
              const slugReserved = isReservedTenantRoute(cat.slug);

              return (
                <div
                  key={cat.id}
                  style={isSubcategory ? { marginLeft: Math.min(depth, 3) * 16 } : undefined}
                  className={cn(
                    'flex flex-col sm:flex-row sm:items-center gap-2.5 p-2.5 bg-muted/20 border border-border/40 rounded-xl transition-all',
                    isSubcategory && 'border-l-2 border-l-primary/70 bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isSubcategory ? (
                      <CornerDownRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-primary/70 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {cat.name}
                        </span>
                        {parent && (
                          <span className="text-[10px] text-muted-foreground">
                            dans {parent.name}
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          'text-[10px] font-mono text-muted-foreground',
                          slugReserved && 'text-destructive'
                        )}
                        title={
                          slugReserved
                            ? 'Ce slug est réservé par une page du site ; renommez la catégorie dans Articles.'
                            : undefined
                        }
                      >
                        /{cat.slug}
                        {slugReserved && ' · réservé'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleCategoryInNav(cat.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer shrink-0 self-start sm:self-auto',
                      !isHiddenFromNav
                        ? 'border-primary/50 bg-primary/10 text-primary shadow-2xs'
                        : 'border-border/40 bg-muted/40 text-muted-foreground hover:text-foreground'
                    )}
                    title={
                      !isHiddenFromNav
                        ? 'Visible dans le menu du site (cliquez pour masquer cette branche)'
                        : 'Masquée du menu du site (cliquez pour afficher cette branche)'
                    }
                  >
                    {!isHiddenFromNav ? (
                      <>
                        <Eye className="w-3 h-3 text-primary" />
                        <span className="text-[11px]">Dans le menu</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3 opacity-60" />
                        <span className="text-[11px]">Masquée</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
