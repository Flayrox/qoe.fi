'use client';

// =====================================================================
// 🦄 PlacementsManager — Console de Contrôle des Placements In-App (2027)
// =====================================================================
// Permet de piloter de manière ultra-fine tous les messages, bannières et
// cartes contextuelles sans dépendre de LaunchDarkly ou d'Appcues.
// =====================================================================

import React, { useState, useTransition } from 'react';
import { Sparkles, Layers, Plus, Trash2, Eye, EyeOff, Target } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import {
  createPlacementAdminAction,
  updatePlacementAdminAction,
  deletePlacementAdminAction,
  type AdminPlacementPayload,
} from '@/lib/admin-aux-actions';

interface PlacementsManagerProps {
  initialPlacements: AdminPlacementPayload[];
}

const PREDEFINED_SLOTS = [
  { value: 'global.notch', label: "Bandeau haut d'écran (global.notch)" },
  { value: 'reader.billing.hero', label: 'En-tête Facturation (reader.billing.hero)' },
  { value: 'reader.library.top', label: 'Haut de Bibliothèque (reader.library.top)' },
  { value: 'reader.feed.interstitial', label: 'Interstitiel du Flux (reader.feed.interstitial)' },
];

export function PlacementsManager({ initialPlacements }: PlacementsManagerProps) {
  const [placements, setPlacements] = useState<AdminPlacementPayload[]>(initialPlacements);
  const [isPending, startTransition] = useTransition();

  // Mode création
  const [isCreating, setIsCreating] = useState(false);
  const [slot, setSlot] = useState('global.notch');
  const [customSlot, setCustomSlot] = useState('');
  const [format, setFormat] = useState<'notch_banner' | 'card' | 'callout' | 'modal'>(
    'notch_banner'
  );
  const [type, setType] = useState<'promo' | 'info' | 'warning' | 'critical'>('promo');
  const [title, setTitle] = useState('Offre Spéciale');
  const [body, setBody] = useState('Découvrez les fonctionnalités avancées de Qoefi Plus.');
  const [ctaLabel, setCtaLabel] = useState('En savoir plus');
  const [ctaUrl, setCtaUrl] = useState('/pricing');
  const [targetAudience, setTargetAudience] = useState<
    'all' | 'free_only' | 'plus_only' | 'pro_only'
  >('free_only');
  const [priority, setPriority] = useState(10);
  const [dismissible, setDismissible] = useState(true);

  const effectiveSlot = slot === 'custom' ? customSlot.trim() : slot;

  const handleCreate = () => {
    if (!effectiveSlot || !title.trim() || !body.trim()) {
      toast.error('Veuillez remplir le slot, le titre et le corps du message.');
      return;
    }

    startTransition(async () => {
      const res = await createPlacementAdminAction({
        slot: effectiveSlot,
        format,
        type,
        title: title.trim(),
        body: body.trim(),
        ctaLabel: ctaLabel.trim() || undefined,
        ctaUrl: ctaUrl.trim() || undefined,
        targetAudience,
        priority: Number(priority) || 0,
        isActive: true,
        dismissible,
      });

      if (res.success && res.placement) {
        toast.success('🎯 Nouveau placement déployé avec succès !');
        setPlacements((prev) => [res.placement!, ...prev]);
        setIsCreating(false);
      } else {
        toast.error(res.error || 'Erreur lors de la création');
      }
    });
  };

  const handleToggleActive = (id: string, currentState: boolean) => {
    startTransition(async () => {
      const res = await updatePlacementAdminAction(id, { isActive: !currentState });
      if (res.success) {
        setPlacements((prev) =>
          prev.map((p) => (p.id === id ? { ...p, isActive: !currentState } : p))
        );
        toast.success(!currentState ? 'Placement activé' : 'Placement mis en pause');
      } else {
        toast.error(res.error || 'Erreur lors de la modification');
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce placement ?')) return;

    startTransition(async () => {
      const res = await deletePlacementAdminAction(id);
      if (res.success) {
        setPlacements((prev) => prev.filter((p) => p.id !== id));
        toast.success('Placement supprimé.');
      } else {
        toast.error(res.error || 'Erreur de suppression');
      }
    });
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-white p-6 shadow-sm space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              Moteur In-App Messaging & Placements (2027)
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Souverain
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Bannières haut d'écran, cartes et slots contextuels ciblés par audience (free, plus,
              pro).
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCreating((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          {isCreating ? 'Fermer le formulaire' : 'Nouveau placement'}
        </button>
      </div>

      {/* Formulaire de création */}
      {isCreating && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Configurer un nouveau slot in-app
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Emplacement (Slot)
              </label>
              <select
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs focus:border-primary focus:outline-none"
              >
                {PREDEFINED_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
                <option value="custom">Autre slot personnalisé...</option>
              </select>
            </div>

            {slot === 'custom' && (
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Nom du slot personnalisé
                </label>
                <input
                  type="text"
                  value={customSlot}
                  onChange={(e) => setCustomSlot(e.target.value)}
                  placeholder="ex: reader.modal.welcome"
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Format d'affichage
              </label>
              <select
                value={format}
                onChange={(e) =>
                  setFormat(e.target.value as 'notch_banner' | 'card' | 'callout' | 'modal')
                }
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs"
              >
                <option value="notch_banner">Bandeau Notch (Courbure inversée)</option>
                <option value="card">Carte in-page (Card)</option>
                <option value="callout">Encart discret (Callout)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Audience ciblée
              </label>
              <select
                value={targetAudience}
                onChange={(e) =>
                  setTargetAudience(
                    e.target.value as 'all' | 'free_only' | 'plus_only' | 'pro_only'
                  )
                }
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium"
              >
                <option value="all">Tous les visiteurs (Connectés + Invités)</option>
                <option value="free_only">Lecteurs Free uniquement (Non abonnés)</option>
                <option value="plus_only">Abonnés Plus uniquement</option>
                <option value="pro_only">Créateurs Pro uniquement</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Type / Thème visuel
              </label>
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as 'promo' | 'info' | 'warning' | 'critical')
                }
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs"
              >
                <option value="promo">Promo (Violet / Hostinger)</option>
                <option value="info">Information (Bleu)</option>
                <option value="warning">Alerte (Ambre)</option>
                <option value="critical">Critique (Rouge)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Priorité (résolution de conflit)
              </label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Titre</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Corps du message
              </label>
              <textarea
                rows={2}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Texte du bouton CTA
              </label>
              <input
                type="text"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Lien cible du CTA
              </label>
              <input
                type="text"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={dismissible}
                onChange={(e) => setDismissible(e.target.checked)}
                className="rounded border-border text-primary focus:ring-0"
              />
              Fermable par l'utilisateur (mémorisé en base sur le compte)
            </label>

            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 shadow-md cursor-pointer disabled:opacity-50"
            >
              {isPending ? 'Déploiement...' : 'Déployer sur la plateforme'}
            </button>
          </div>
        </div>
      )}

      {/* Liste des placements existants */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">
          Slots actifs et programmés ({placements.length})
        </h3>

        {placements.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Aucun placement configuré pour le moment.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {placements.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-border/80 bg-muted/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-muted/20"
              >
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-foreground bg-white px-2 py-0.5 rounded-md border border-border shadow-2xs">
                      {p.slot}
                    </span>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {p.format}
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                      <Target className="w-3 h-3" />
                      {p.targetAudience === 'free_only'
                        ? 'Free uniquement'
                        : p.targetAudience === 'plus_only'
                          ? 'Plus uniquement'
                          : p.targetAudience === 'pro_only'
                            ? 'Pro uniquement'
                            : 'Tous'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">Poids: {p.priority}</span>
                  </div>

                  <p className="text-xs font-bold text-foreground">{p.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{p.body}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(p.id!, p.isActive)}
                    disabled={isPending}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      p.isActive
                        ? 'bg-success/10 text-success border border-success/30 hover:bg-success/20'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {p.isActive ? (
                      <>
                        <Eye className="w-3 h-3" /> Actif
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3" /> En pause
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(p.id!)}
                    disabled={isPending}
                    className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
