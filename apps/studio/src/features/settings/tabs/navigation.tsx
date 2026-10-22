import React from 'react';
import { t } from '@lingui/core/macro';
import {
  Plus,
  Trash2,
  FolderTree,
  CornerDownRight,
  ExternalLink,
  Check,
  Eye,
  EyeOff,
  Share2,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import type { CreatorProfile, ClientNavigationItem } from '../types';
import { SUPPORTED_SOCIAL_PLATFORMS } from '../types';

interface NavigationTabProps {
  current: CreatorProfile;
  setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>;
  addNavigationLink: () => void;
  removeNavigationLink: (idx: number) => void;
  reorderNavigationLink: (idx: number, direction: 'up' | 'down') => void;
  addSocialLink: (platform: string) => void;
  removeSocialLink: (idx: number) => void;
}

export function NavigationTab({
  current,
  setCurrent,
  addNavigationLink,
  removeNavigationLink,
  addSocialLink,
  removeSocialLink,
}: NavigationTabProps) {
  // Liste des IDs des catégories masquées du menu de navigation (catégories seules)
  const hiddenNavCategoryIds =
    (current.siteOptions?.hiddenNavCategoryIds as string[] | undefined) || [];

  const toggleCategoryInNav = (catId: string) => {
    const isHidden = hiddenNavCategoryIds.includes(catId);
    const nextHidden = isHidden
      ? hiddenNavCategoryIds.filter((id) => id !== catId)
      : [...hiddenNavCategoryIds, catId];

    setCurrent((prev) => ({
      ...prev,
      siteOptions: {
        ...(prev.siteOptions || {}),
        hiddenNavCategoryIds: nextHidden,
      },
    }));
  };

  // Liens externes uniquement (isExternal === true)
  const externalLinks = current.navigation.filter((n) => n.isExternal);

  const addExternalLink = () => {
    const newLink: ClientNavigationItem = {
      label: 'Nouveau lien',
      url: 'https://',
      order: current.navigation.length,
      isExternal: true,
      parentId: null,
    };
    setCurrent((prev) => ({ ...prev, navigation: [...prev.navigation, newLink] }));
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* ── 1. RUBRIQUES & CATÉGORIES D'ARTICLES ── */}
      <div
        id="categories"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/30">
          <div>
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Rubriques & Catégories d'articles
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Vos catégories classent vos articles. Activez ou désactivez le statut « Rubrique »
              selon que vous souhaitez qu'elle apparaisse ou non dans la barre du haut.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const newId = `temp-${Date.now()}`;
              const uniqueSlug = `rubrique-${Date.now().toString(36)}`;
              setCurrent((prev) => ({
                ...prev,
                categories: [
                  ...prev.categories,
                  {
                    id: newId,
                    name: 'Nouvelle rubrique',
                    slug: uniqueSlug,
                    parentId: null,
                  },
                ],
              }));
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajouter une catégorie</span>
          </button>
        </div>

        {current.categories.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-border/40 rounded-lg text-xs text-muted-foreground">
            Aucune catégorie configurée pour le moment.
          </div>
        ) : (
          <div className="space-y-2.5">
            {current.categories.map((cat, idx) => {
              const isSubcategory = Boolean(cat.parentId);
              const isHiddenFromNav = hiddenNavCategoryIds.includes(cat.id);
              const parentCandidates = current.categories.filter(
                (c) => c.id !== cat.id && !c.parentId
              );

              return (
                <div
                  key={cat.id || idx}
                  className={cn(
                    'flex flex-col md:flex-row md:items-center gap-2.5 p-2.5 bg-muted/20 border border-border/40 rounded-xl transition-all',
                    isSubcategory && 'ml-4 sm:ml-6 border-l-2 border-l-primary/70 bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-[200px] flex-1">
                    {isSubcategory ? (
                      <CornerDownRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-primary/70 shrink-0" />
                    )}
                    <input
                      type="text"
                      value={cat.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        const newSlug = newName
                          .toLowerCase()
                          .normalize('NFD')
                          .replace(/[\u0300-\u036f]/g, '')
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-+|-+$/g, '');
                        const updated = [...current.categories];
                        updated[idx] = {
                          ...updated[idx],
                          name: newName,
                          slug: newSlug || updated[idx].slug,
                        };
                        setCurrent((prev) => ({ ...prev, categories: updated }));
                      }}
                      placeholder="Nom de la rubrique"
                      className="w-full px-3 py-1.5 bg-background border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <span className="text-[11px] text-muted-foreground font-mono bg-muted/40 px-2 py-1 rounded shrink-0">
                      /{cat.slug}
                    </span>

                    {/* Sélection du parent pour en faire une sous-rubrique */}
                    <select
                      value={cat.parentId || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        const updated = [...current.categories];
                        updated[idx] = { ...updated[idx], parentId: val };
                        setCurrent((prev) => ({ ...prev, categories: updated }));
                      }}
                      className="px-2 py-1.5 bg-background border border-border/40 rounded-lg text-xs text-foreground focus:outline-none cursor-pointer max-w-[150px] truncate"
                      title="Parent de la rubrique"
                    >
                      <option value="">Rubrique racine</option>
                      {parentCandidates.map((p) => (
                        <option key={p.id} value={p.id}>
                          Sous-rubrique de : {p.name}
                        </option>
                      ))}
                    </select>

                    {/* Toggle Rubrique en haut vs Catégorie seule */}
                    <button
                      type="button"
                      onClick={() => toggleCategoryInNav(cat.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer shrink-0',
                        !isHiddenFromNav
                          ? 'border-primary/50 bg-primary/10 text-primary shadow-2xs'
                          : 'border-border/40 bg-muted/40 text-muted-foreground hover:text-foreground'
                      )}
                      title={
                        !isHiddenFromNav
                          ? 'Visible dans la barre de navigation du site'
                          : 'Masquée du menu (catégorie d’articles seule)'
                      }
                    >
                      {!isHiddenFromNav ? (
                        <>
                          <Eye className="w-3 h-3 text-primary" />
                          <span className="text-[11px]">Rubrique active</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3 opacity-60" />
                          <span className="text-[11px]">Catégorie seule</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCurrent((prev) => ({
                          ...prev,
                          categories: prev.categories.filter((_, i) => i !== idx),
                        }));
                      }}
                      className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="Supprimer la rubrique"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 2. LIENS EXTERNES DU MENU (PODCAST, TWITTER, BOUTIQUE...) ── */}
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
              rubriques.
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
            Aucun lien externe configuré. Seules vos rubriques actives apparaîtront dans la barre du
            haut.
          </div>
        ) : (
          <div className="space-y-2">
            {externalLinks.map((nav) => {
              const globalIndex = current.navigation.findIndex((n) => n === nav);
              return (
                <div
                  key={globalIndex}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 bg-muted/20 border border-border/40 rounded-xl"
                >
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

      {/* ── 3. RÉSEAUX SOCIAUX ── */}
      <div
        id="social"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
      >
        <div className="flex items-center gap-2 pb-2 border-b border-border/30">
          <Share2 className="w-4 h-4 text-primary" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Réseaux sociaux
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connectez vos profils pour permettre à vos lecteurs de vous suivre.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {SUPPORTED_SOCIAL_PLATFORMS.map((plat) => {
            const isConnected = current.socialLinks.some((s) => s.platform === plat.id);
            return (
              <button
                key={plat.id}
                type="button"
                disabled={isConnected}
                onClick={() => addSocialLink(plat.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer',
                  isConnected
                    ? 'bg-muted/20 border-border/20 text-muted-foreground/40 cursor-not-allowed'
                    : 'border-border/40 bg-muted/20 hover:bg-muted/50 text-foreground'
                )}
              >
                {plat.name} {isConnected && '✓'}
              </button>
            );
          })}
        </div>

        {current.socialLinks.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/30">
            {current.socialLinks.map((s, idx) => (
              <div
                key={s.platform}
                className="flex items-center gap-2 p-2 bg-muted/20 border border-border/30 rounded-lg"
              >
                <span className="text-xs font-semibold text-foreground capitalize w-24 px-1 truncate">
                  {s.platform}
                </span>
                <input
                  type="text"
                  value={s.url}
                  onChange={(e) => {
                    const updated = [...current.socialLinks];
                    updated[idx] = { ...updated[idx], url: e.target.value };
                    setCurrent((prev) => ({ ...prev, socialLinks: updated }));
                  }}
                  className="flex-1 px-3 py-1.5 bg-background border border-border/40 rounded text-xs font-medium text-foreground focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeSocialLink(idx)}
                  className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
