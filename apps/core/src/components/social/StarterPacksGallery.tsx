'use client';

import React, { useEffect, useState } from 'react';
import { t } from '@lingui/core/macro';
import { Sparkles, Loader2, Plus, Compass } from 'lucide-react';
import { getStarterPacksAction, createStarterPackAction } from '@qoe/sdk';
import { StarterPackCard, type StarterPackCardProps } from './StarterPackCard';

export function StarterPacksGallery() {
  const [starterPacks, setStarterPacks] = useState<StarterPackCardProps['pack'][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewTitleDesc] = useState('');
  const [newIcon, setNewIcon] = useState('🚀');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadPacks() {
      try {
        const res = await getStarterPacksAction({ limit: 20 });
        if (res.ok && res.data.starterPacks) {
          setStarterPacks(res.data.starterPacks);
        }
      } catch (err) {
        console.error('Error loading starter packs:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadPacks();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await createStarterPackAction({
        title: newTitle,
        description: newDesc,
        icon: newIcon,
        userIds: [],
      });
      if (res.ok && res.data.starterPack) {
        setStarterPacks((prev) => [res.data.starterPack, ...prev]);
        setNewTitle('');
        setNewTitleDesc('');
        setIsCreating(false);
      }
    } catch (err) {
      console.error('Error creating starter pack:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Creation Toggle / Banner */}
      <div className="flex items-center justify-between bg-card/60 border border-border/60 backdrop-blur-md p-4 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-foreground">Découvrez les Starter Packs</h2>
            <p className="text-xs text-muted-foreground">
              S'abonner à une sélection d'auteurs en 1-clic.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-all shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isCreating ? t`Fermer` : t`Créer un Pack`}</span>
        </button>
      </div>

      {/* Creation Form */}
      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <h3 className="text-sm font-bold text-foreground">Nouveau Starter Pack</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newIcon}
              onChange={(e) => setNewIcon(e.target.value)}
              placeholder="🚀"
              className="w-12 px-2 py-1.5 text-center text-lg bg-background border border-border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Titre du pack (ex: Les Incontournables Tech)"
              className="flex-1 px-3 py-1.5 text-xs bg-background border border-border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-primary"
              required
            />
          </div>
          <textarea
            value={newDesc}
            onChange={(e) => setNewTitleDesc(e.target.value)}
            placeholder={t`Description optionnelle de la sélection...`}
            className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-primary resize-none h-20"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !newTitle.trim()}
              className="px-4 py-1.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Publier le pack</span>
            </button>
          </div>
        </form>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && starterPacks.length === 0 && (
        <div className="text-center py-12 space-y-2 border border-dashed border-border rounded-2xl">
          <p className="text-sm font-bold text-foreground">Aucun Starter Pack pour le moment</p>
          <p className="text-xs text-muted-foreground">
            Soyez le premier à partager une liste d'auteurs inspirants !
          </p>
        </div>
      )}

      {/* Starter Packs Grid */}
      {!isLoading && starterPacks.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {starterPacks.map((pack) => (
            <StarterPackCard key={pack.id} pack={pack} />
          ))}
        </div>
      )}
    </div>
  );
}
