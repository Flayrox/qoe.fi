'use client';

// =====================================================================
// 🤝 recommendations.tsx — Onglet Recommandations Créateurs & Médias
// =====================================================================
// Permet de gérer la liste des publications et créateurs recommandés
// à son audience pour créer un maillage souverain et solidaire.
// =====================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Globe,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import {
  getRecommendationsAction,
  addRecommendationAction,
  removeRecommendationAction,
  lookupPublicationByDomainAction,
  type RecommendationItemDto,
} from '@qoe/sdk/actions/recommendations';
import type { CreatorProfile } from '../types';

interface RecommendationsTabProps {
  current: CreatorProfile;
  setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>;
}

export function RecommendationsTab({ current, setCurrent }: RecommendationsTabProps) {
  const [recommendations, setRecommendations] = useState<RecommendationItemDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulaire d'ajout
  const [domainInput, setDomainInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [foundPub, setFoundPub] = useState<{
    id: string;
    name: string;
    slug: string;
    subdomain: string | null;
    logoUrl: string | null;
    bio: string | null;
  } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Charger les recommandations existantes
  const loadRecs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getRecommendationsAction();
      if (res.ok && res.data) {
        setRecommendations(res.data);
      }
    } catch {
      setError('Impossible de charger les recommandations.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecs();
  }, [loadRecs]);

  // Rechercher une publication à recommander
  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = domainInput.trim();
    if (!query) return;

    setIsSearching(true);
    setSearchError(null);
    setFoundPub(null);

    try {
      const res = await lookupPublicationByDomainAction({ domain: query });
      if (res.ok && res.data) {
        setFoundPub(res.data);
      } else {
        setSearchError('Aucune publication trouvée avec ce domaine ou sous-domaine.');
      }
    } catch {
      setSearchError('Erreur lors de la recherche.');
    } finally {
      setIsSearching(false);
    }
  };

  // Ajouter la recommandation
  const handleAdd = async () => {
    if (!foundPub) return;
    setIsAdding(true);
    try {
      const res = await addRecommendationAction({
        recommendedId: foundPub.id,
        description: noteInput.trim() || undefined,
      });
      if (res.ok) {
        setFoundPub(null);
        setDomainInput('');
        setNoteInput('');
        await loadRecs();
      } else {
        alert(res.error || "Impossible d'ajouter la recommandation.");
      }
    } catch {
      alert("Une erreur est survenue lors de l'ajout.");
    } finally {
      setIsAdding(false);
    }
  };

  // Supprimer une recommandation
  const handleRemove = async (recommendedId: string, name: string) => {
    if (!confirm(`Retirer "${name}" de vos recommandations ?`)) return;

    try {
      const res = await removeRecommendationAction({ recommendedId });
      if (res.ok) {
        setRecommendations((prev) =>
          prev.filter((r) => r.id !== recommendedId && r.publicationId !== recommendedId)
        );
        await loadRecs();
      }
    } catch {
      alert('Impossible de supprimer la recommandation.');
    }
  };

  const showRecsOnHome = (current.siteOptions?.showRecommendationsOnHome ?? true) !== false;
  const showRecsInSidebar = (current.siteOptions?.showRecommendationsInSidebar ?? true) !== false;

  const toggleOption = (key: string) => {
    setCurrent((prev) => {
      const existing = prev.siteOptions || {};
      const currentVal = (existing[key] ?? true) !== false;
      return {
        ...prev,
        siteOptions: {
          ...existing,
          [key]: !currentVal,
        },
      };
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* ── EN-TÊTE DE L'ONGLET ── */}
      <div className="space-y-1.5 pb-6 border-b border-border/40">
        <div className="flex items-center gap-2.5 text-primary">
          <Sparkles className="w-5 h-5 stroke-[1.5]" />
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Créateurs & Publications Recommandés
          </h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Recommandez d’autres publications souveraines à votre lectorat pour créer un réseau
          solidaire et favoriser la découvrabilité mutuelle de vos écrits.
        </p>
      </div>

      {/* ── OPTIONS D'AFFICHAGE SUR LE SITE ── */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs">
        <h3 className="text-sm font-semibold text-foreground tracking-tight">
          Emplacements d’affichage sur votre site
        </h3>
        <div className="divide-y divide-border/30">
          <div className="py-3 flex items-center justify-between gap-4 first:pt-0">
            <div>
              <label
                htmlFor="opt-rec-sidebar"
                className="text-xs font-semibold text-foreground cursor-pointer block"
              >
                Colonne latérale éditoriale
              </label>
              <span className="text-[11px] text-muted-foreground block">
                Affiche l’encart « Recommandé par l’auteur » dans la barre latérale de l’accueil
              </span>
            </div>
            <button
              type="button"
              id="opt-rec-sidebar"
              role="switch"
              aria-checked={showRecsInSidebar}
              onClick={() => toggleOption('showRecommendationsInSidebar')}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                showRecsInSidebar ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out',
                  showRecsInSidebar ? 'translate-x-4' : 'translate-x-0'
                )}
              />
            </button>
          </div>

          <div className="py-3 flex items-center justify-between gap-4 last:pb-0">
            <div>
              <label
                htmlFor="opt-rec-home"
                className="text-xs font-semibold text-foreground cursor-pointer block"
              >
                Section Réseau en pied de page d’accueil
              </label>
              <span className="text-[11px] text-muted-foreground block">
                Affiche la grille complète des créateurs recommandés sous le flux d’articles
              </span>
            </div>
            <button
              type="button"
              id="opt-rec-home"
              role="switch"
              aria-checked={showRecsOnHome}
              onClick={() => toggleOption('showRecommendationsOnHome')}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                showRecsOnHome ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out',
                  showRecsOnHome ? 'translate-x-4' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── FORMULAIRE : AJOUTER UNE RECOMMANDATION ── */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5 shadow-2xs">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Ajouter une recommandation</h3>
        </div>

        <form onSubmit={handleLookup} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="Domaine, sous-domaine ou nom (ex: souverainete, adminoo)..."
                className="w-full rounded-xl border border-input bg-background py-2.5 pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || !domainInput.trim()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>Trouver</span>
            </button>
          </div>

          {searchError && (
            <p className="text-xs text-destructive flex items-center gap-1.5 pt-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{searchError}</span>
            </p>
          )}

          {foundPub && (
            <div className="p-4 rounded-xl border border-primary/25 bg-primary/5 space-y-3.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {foundPub.logoUrl ? (
                    <img
                      src={foundPub.logoUrl}
                      alt={foundPub.name}
                      className="w-10 h-10 rounded-full object-cover border border-border/50"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                      {foundPub.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{foundPub.name}</h4>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {foundPub.subdomain ? `${foundPub.subdomain}.qoe.fi` : foundPub.slug}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Trouvé
                </span>
              </div>

              {foundPub.bio && (
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {foundPub.bio}
                </p>
              )}

              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-medium text-foreground block">
                  Note ou mot de recommandation (optionnel)
                </label>
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Pourquoi recommandez-vous cette publication à vos lecteurs ?"
                  className="w-full rounded-lg border border-input bg-background py-2 px-3 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={isAdding}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isAdding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Recommander cette publication</span>
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* ── LISTE DES RECOMMANDATIONS ACTIVES ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Vos recommandations actives ({recommendations.length})
          </h3>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Chargement des recommandations...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-xs">
            {error}
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center p-8 border border-dashed border-border/60 rounded-2xl space-y-2">
            <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm font-medium text-foreground">Aucune recommandation configurée</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Utilisez le champ ci-dessus pour chercher une publication ou un auteur souverain et
              l’ajouter à vos recommandations.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {recommendations.map((rec) => {
              const domain =
                rec.publicationCustomDomain ||
                (rec.publicationSubdomain
                  ? `${rec.publicationSubdomain}.qoe.fi`
                  : rec.publicationSlug);
              return (
                <div
                  key={rec.id}
                  className="p-4 rounded-2xl border border-border/50 bg-card hover:border-border transition-colors flex items-center justify-between gap-4 group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {rec.publicationLogoUrl ? (
                      <img
                        src={rec.publicationLogoUrl}
                        alt={rec.publicationName}
                        className="w-10 h-10 rounded-full object-cover border border-border/40 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted text-foreground flex items-center justify-center font-bold text-sm shrink-0 border border-border/40">
                        {rec.publicationName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-foreground truncate">
                          {rec.publicationName}
                        </h4>
                        <a
                          href={`https://${domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-primary transition-colors p-0.5"
                          title="Visiter la publication"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{domain}</p>
                      {rec.description && (
                        <p className="text-xs text-muted-foreground/90 mt-1 italic line-clamp-1">
                          « {rec.description} »
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemove(rec.id, rec.publicationName)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer shrink-0"
                    title="Retirer la recommandation"
                  >
                    <Trash2 className="w-4 h-4 stroke-[1.5]" />
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
