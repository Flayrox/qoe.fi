import React from 'react';
import { t } from '@lingui/core/macro';
import { Plus, Trash2, ArrowUp, ArrowDown, FolderTree, CornerDownRight } from 'lucide-react';
import { cn } from '@qoe/utils';
import type { CreatorProfile } from '../types';
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
  reorderNavigationLink,
  addSocialLink,
  removeSocialLink,
}: NavigationTabProps) {
  return (
    <div className="max-w-3xl space-y-8">
      {/* ── 1. MENU DE NAVIGATION / ONGLETS ── */}
      <div
        id="links"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
      >
        <div className="flex items-center justify-between pb-2 border-b border-border/30">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Menu de navigation du site
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Liens et onglets affichés en haut de votre site web.
            </p>
          </div>
          <button
            type="button"
            onClick={addNavigationLink}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajouter un onglet</span>
          </button>
        </div>

        {current.navigation.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-border/40 rounded-lg text-xs text-muted-foreground">
            Aucun lien de menu configuré pour le moment.
          </div>
        ) : (
          <div className="space-y-2">
            {current.navigation.map((nav, idx) => {
              const isSubTab = Boolean(nav.parentId);
              const parentCandidates = current.navigation.filter(
                (n, i) => i !== idx && !n.parentId
              );

              return (
                <div
                  key={idx}
                  className={cn(
                    'flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-muted/20 border border-border/30 rounded-lg transition-all',
                    isSubTab && 'ml-5 border-l-2 border-l-primary/60 bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => reorderNavigationLink(idx, 'up')}
                        className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === current.navigation.length - 1}
                        onClick={() => reorderNavigationLink(idx, 'down')}
                        className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>

                    {isSubTab && (
                      <CornerDownRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                  </div>

                  <input
                    type="text"
                    value={nav.label}
                    onChange={(e) => {
                      const updated = [...current.navigation];
                      updated[idx] = { ...updated[idx], label: e.target.value };
                      setCurrent((prev) => ({ ...prev, navigation: updated }));
                    }}
                    placeholder={t`Intitulé`}
                    className="w-full sm:w-1/3 px-3 py-1.5 bg-background border border-border/40 rounded text-xs font-medium text-foreground focus:outline-none"
                  />

                  <input
                    type="text"
                    value={nav.url || ''}
                    onChange={(e) => {
                      const updated = [...current.navigation];
                      updated[idx] = { ...updated[idx], url: e.target.value };
                      setCurrent((prev) => ({ ...prev, navigation: updated }));
                    }}
                    placeholder="https://"
                    className="flex-1 px-3 py-1.5 bg-background border border-border/40 rounded text-xs font-medium text-foreground focus:outline-none"
                  />

                  {/* Rattachement parent pour sous-onglets déroulants */}
                  <select
                    value={nav.parentId || ''}
                    onChange={(e) => {
                      const updated = [...current.navigation];
                      updated[idx] = { ...updated[idx], parentId: e.target.value || null };
                      setCurrent((prev) => ({ ...prev, navigation: updated }));
                    }}
                    className="px-2 py-1.5 bg-background border border-border/40 rounded text-[11px] text-foreground focus:outline-none cursor-pointer max-w-[140px] truncate"
                    title="Imbrication dans un onglet parent"
                  >
                    <option value="">Onglet direct</option>
                    {parentCandidates.map((p, pIdx) => (
                      <option key={p.id || pIdx} value={p.id || `parent-${pIdx}`}>
                        Sous-onglet de : {p.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => removeNavigationLink(idx)}
                    className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer shrink-0 ml-auto"
                    title="Supprimer l'onglet"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 2. RUBRIQUES & SOUS-RUBRIQUES DU MÉDIA (CATÉGORIES) ── */}
      <div
        id="categories"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
      >
        <div className="flex items-center justify-between pb-2 border-b border-border/30">
          <div>
            <div className="flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Rubriques & Sous-rubriques
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Organisez les rubriques de votre publication. Les sous-rubriques s’affichent en menu
              déroulant dans l’en-tête.
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
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajouter une rubrique</span>
          </button>
        </div>

        {current.categories.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-border/40 rounded-lg text-xs text-muted-foreground">
            Aucune rubrique configurée pour le moment.
          </div>
        ) : (
          <div className="space-y-2">
            {current.categories.map((cat, idx) => {
              const isSubcategory = Boolean(cat.parentId);
              const parentCandidates = current.categories.filter(
                (c) => c.id !== cat.id && !c.parentId
              );

              return (
                <div
                  key={cat.id || idx}
                  className={cn(
                    'flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 bg-muted/20 border border-border/30 rounded-lg transition-all',
                    isSubcategory && 'ml-5 border-l-2 border-l-primary/60 bg-muted/30'
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
                      className="w-full px-3 py-1.5 bg-background border border-border/40 rounded text-xs font-medium text-foreground focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground font-mono bg-muted/40 px-2 py-1 rounded">
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
                      className="px-2.5 py-1.5 bg-background border border-border/40 rounded text-xs text-foreground focus:outline-none cursor-pointer max-w-[170px] truncate"
                      title="Parent de la rubrique"
                    >
                      <option value="">Rubrique racine</option>
                      {parentCandidates.map((p) => (
                        <option key={p.id} value={p.id}>
                          Sous-rubrique de : {p.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => {
                        setCurrent((prev) => ({
                          ...prev,
                          categories: prev.categories.filter((_, i) => i !== idx),
                        }));
                      }}
                      className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer shrink-0"
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

      {/* ── 3. RÉSEAUX SOCIAUX ── */}
      <div
        id="social"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
      >
        <div className="pb-2 border-b border-border/30">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Réseaux sociaux
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connectez vos profils externes pour vos lecteurs.
          </p>
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
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  isConnected
                    ? 'bg-muted/20 border-border/20 text-muted-foreground/40 cursor-not-allowed'
                    : 'border-border/40 bg-muted/20 hover:bg-muted/50 text-foreground'
                }`}
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
