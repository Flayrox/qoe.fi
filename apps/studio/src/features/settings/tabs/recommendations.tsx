'use client';

// =====================================================================
// 🤝 recommendations.tsx — Onglet Recommandations Créateurs & Médias
// =====================================================================
// Permet de gérer la liste des publications et créateurs recommandés
// à son audience pour créer un maillage souverain et solidaire.
// =====================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Trash2,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Globe,
} from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input, InputGroup } from '@qoe/ui/input';
import { toast } from '@qoe/ui/toast';
import { Switch } from '@qoe/ui/switch';
import { t } from '@lingui/core/macro';
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Charger les recommandations existantes
  const loadRecs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getRecommendationsAction();
      if (res.ok && res.data) {
        setRecommendations(res.data);
      } else if (!res.ok) {
        setError(res.error?.message || 'Impossible de charger les recommandations.');
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
        toast.success(t`Recommandation ajoutée avec succès !`);
        setFoundPub(null);
        setDomainInput('');
        setNoteInput('');
        await loadRecs();
      } else {
        toast.error(res.error?.message || t`Impossible d'ajouter la recommandation.`);
      }
    } catch {
      toast.error(t`Une erreur est survenue lors de l'ajout.`);
    } finally {
      setIsAdding(false);
    }
  };

  // Supprimer une recommandation
  const handleRemove = async (recommendedId: string, name: string) => {
    try {
      const res = await removeRecommendationAction({ recommendedId });
      if (res.ok) {
        toast.success(t`"${name}" retirée des recommandations.`);
        setConfirmDeleteId(null);
        setRecommendations((prev) =>
          prev.filter((r) => r.id !== recommendedId && r.publicationId !== recommendedId)
        );
        await loadRecs();
      } else {
        toast.error(res.error?.message || t`Impossible de supprimer la recommandation.`);
      }
    } catch {
      toast.error(t`Impossible de supprimer la recommandation.`);
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
    <div className="space-y-6">
      {/* ── EN-TÊTE DE L'ONGLET ── */}
      <div className="space-y-1.5 pb-6 border-b border-border/40">
        <div className="flex items-center gap-2.5 text-primary">
          <Users className="w-5 h-5 stroke-[1.5]" />
          <h2 className="text-xl font-bold tracking-tight text-foreground">Recommandations</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Mettez en avant les publications que vous lisez.
        </p>
      </div>

      {/* ── OPTIONS D'AFFICHAGE SUR LE SITE ── */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs">
        <h3 className="text-sm font-semibold text-foreground tracking-tight">
          Affichage sur le site
        </h3>
        <div className="divide-y divide-border/30">
          <div className="py-3 flex items-center justify-between gap-4 first:pt-0">
            <Switch
              id="opt-rec-sidebar"
              isSelected={showRecsInSidebar}
              onChange={() => toggleOption('showRecommendationsInSidebar')}
              label={
                <span className="text-xs font-semibold text-foreground">Colonne latérale</span>
              }
              description={
                <span className="text-[11px] text-muted-foreground">
                  Affiche « Recommandé par l’auteur » dans la barre latérale.
                </span>
              }
              className="w-full"
            />
          </div>

          <div className="py-3 flex items-center justify-between gap-4 last:pb-0">
            <Switch
              id="opt-rec-home"
              isSelected={showRecsOnHome}
              onChange={() => toggleOption('showRecommendationsOnHome')}
              label={
                <span className="text-xs font-semibold text-foreground">
                  Section en pied de page
                </span>
              }
              description={
                <span className="text-[11px] text-muted-foreground">
                  Affiche la grille sous le flux d’articles.
                </span>
              }
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* ── FORMULAIRE : AJOUTER UNE RECOMMANDATION ── */}
      <div className="space-y-4 rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Ajouter une recommandation</h3>
        </div>

        <form onSubmit={handleLookup} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <InputGroup left={<Search />} className="flex-1">
              <Input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder={t`Domaine ou nom de la publication`}
              />
            </InputGroup>
            <Button
              type="submit"
              variant="soft"
              size="md"
              disabled={isSearching || !domainInput.trim()}
            >
              {isSearching ? <Loader2 className="animate-spin" /> : <Search />}
              <span>Trouver</span>
            </Button>
          </div>

          {searchError && (
            <p className="text-xs text-destructive-text flex items-center gap-1.5 pt-1">
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
                <Badge variant="outline" tone="brand" shape="pill">
                  <CheckCircle2 />
                  <span>Trouvé</span>
                </Badge>
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
                <Input
                  type="text"
                  size="sm"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Pourquoi recommandez-vous cette publication à vos lecteurs ?"
                />
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  variant="solid"
                  tone="brand"
                  size="sm"
                  onClick={handleAdd}
                  disabled={isAdding}
                >
                  {isAdding ? <Loader2 className="animate-spin" /> : <Plus />}
                  <span>Ajouter</span>
                </Button>
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
          <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive-text text-xs flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button
              variant="outline"
              tone="danger"
              size="xs"
              onClick={loadRecs}
              className="shrink-0"
            >
              Réessayer
            </Button>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center p-8 border border-dashed border-border/60 rounded-2xl space-y-2">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm font-medium text-foreground">Aucune recommandation configurée</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Cherchez une publication ci-dessus pour l’ajouter.
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

                  {confirmDeleteId === rec.id ? (
                    <div className="flex items-center gap-1.5 shrink-0 animate-in fade-in duration-150">
                      <Button
                        variant="solid"
                        tone="danger"
                        size="xs"
                        onClick={() => handleRemove(rec.id, rec.publicationName)}
                      >
                        Retirer
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setConfirmDeleteId(null)}>
                        Annuler
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      tone="danger"
                      size="sm"
                      shape="icon"
                      onClick={() => setConfirmDeleteId(rec.id)}
                      className="shrink-0 text-muted-foreground"
                      title={t`Retirer la recommandation`}
                      aria-label={t`Retirer la recommandation`}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
