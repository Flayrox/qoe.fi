import React from 'react';
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
  reorderNavigationLink,
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

  // Liens externes uniquement (isExternal === true)
  const externalLinks = current.navigation.filter((n) => n.isExternal);

  const addExternalLink = () => {
    const newLink: ClientNavigationItem = {
      label: 'Nouveau lien',
      // Pas de "https://" pré-rempli : une URL incomplète finit dans le menu public.
      url: '',
      order: current.navigation.length,
      isExternal: true,
      parentId: null,
    };
    setCurrent((prev) => ({ ...prev, navigation: [...prev.navigation, newLink] }));
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* ── 1. CATÉGORIES & VISIBILITÉ DANS LE MENU ── */}
      <div
        id="categories"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/30">
          <div>
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Catégories & menu
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Choisissez les catégories visibles dans le menu. Masquer une catégorie masque aussi
              ses sous-catégories. Création, renommage, slug et hiérarchie se gèrent dans Articles →
              Catégories.
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

      {/* ── 2. LIENS EXTERNES DU MENU (PODCAST, BOUTIQUE...) ── */}
      <div
        id="links"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/30">
          <div>
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Liens externes du menu
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Ajoutez des raccourcis vers vos autres espaces (Podcast, Boutique, Substack,
              YouTube...) qui s’afficheront directement dans la barre du haut aux côtés de vos
              catégories.
            </p>
          </div>
          <button
            type="button"
            onClick={addExternalLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajouter un lien externe</span>
          </button>
        </div>

        {externalLinks.length === 0 ? (
          <div className="py-6 text-center border border-dashed border-border/40 rounded-lg text-xs text-muted-foreground">
            Aucun lien externe configuré. Seules vos catégories visibles apparaîtront dans la barre
            du haut.
          </div>
        ) : (
          <div className="space-y-2">
            {externalLinks.map((nav, extIdx) => {
              const globalIndex = current.navigation.findIndex((n) => n === nav);
              return (
                <div
                  key={globalIndex}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 bg-muted/20 border border-border/40 rounded-xl"
                >
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={extIdx === 0}
                      onClick={() => reorderNavigationLink(globalIndex, 'up')}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                      title="Monter ce lien"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={extIdx === externalLinks.length - 1}
                      onClick={() => reorderNavigationLink(globalIndex, 'down')}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                      title="Descendre ce lien"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={nav.label}
                    onChange={(e) => {
                      const updated = [...current.navigation];
                      updated[globalIndex] = { ...updated[globalIndex], label: e.target.value };
                      setCurrent((prev) => ({ ...prev, navigation: updated }));
                    }}
                    placeholder="Intitulé (ex. Mon Podcast)"
                    className="w-full sm:w-1/3 px-3 py-1.5 bg-background border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                  />

                  <input
                    type="url"
                    value={nav.url || ''}
                    onChange={(e) => {
                      const updated = [...current.navigation];
                      updated[globalIndex] = { ...updated[globalIndex], url: e.target.value };
                      setCurrent((prev) => ({ ...prev, navigation: updated }));
                    }}
                    placeholder="https://mon-podcast.com"
                    className="flex-1 px-3 py-1.5 bg-background border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                  />

                  <button
                    type="button"
                    onClick={() => removeNavigationLink(globalIndex)}
                    className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer shrink-0 ml-auto"
                    title="Supprimer ce lien"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
