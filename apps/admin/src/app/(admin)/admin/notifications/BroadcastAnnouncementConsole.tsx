'use client';

// =====================================================================
// 📣 BroadcastAnnouncementConsole — Console Admin d'Annonce Globale
// =====================================================================
// Permet de diffuser en temps réel une bannière de notification
// à courbure inversée sur l'ensemble de la plateforme.
// =====================================================================

import React, { useState, useTransition } from 'react';
import { Sparkles, Megaphone, Send, CheckCircle2, Globe, Eye, EyeOff } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { Button } from '@qoe/ui/button';
import { Input, Textarea } from '@qoe/ui/input';
import { InvertedCurveBanner, type AnnouncementType } from '@qoe/ui';
import { Select } from '@qoe/ui/select';
import {
  saveGlobalAnnouncementAction,
  type GlobalAnnouncementPayload,
} from '@/lib/admin-aux-actions';

interface BroadcastAnnouncementConsoleProps {
  initialAnnouncement: GlobalAnnouncementPayload | null;
}

export function BroadcastAnnouncementConsole({
  initialAnnouncement,
}: BroadcastAnnouncementConsoleProps) {
  const [active, setActive] = useState(initialAnnouncement?.active ?? false);
  const [message, setMessage] = useState(
    initialAnnouncement?.message ?? 'Bienvenue sur Qoefi ! Découvrez nos dernières fonctionnalités.'
  );
  const [type, setType] = useState<AnnouncementType>(initialAnnouncement?.type ?? 'promo');
  const [linkUrl, setLinkUrl] = useState(initialAnnouncement?.linkUrl ?? '');
  const [linkText, setLinkText] = useState(initialAnnouncement?.linkText ?? 'En savoir plus');
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSave = (newActiveState?: boolean) => {
    const nextActive = newActiveState !== undefined ? newActiveState : active;
    startTransition(async () => {
      const res = await saveGlobalAnnouncementAction({
        id: initialAnnouncement?.id || `ann_${Date.now()}`,
        active: nextActive,
        message: message.trim(),
        type,
        linkUrl: linkUrl.trim() || undefined,
        linkText: linkText.trim() || undefined,
      });

      if (res.success) {
        setFeedback(nextActive ? 'Annonce diffusée sur la plateforme.' : 'Annonce désactivée.');
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement de l'annonce.");
      }
    });
  };

  const handleToggleActive = () => {
    const next = !active;
    setActive(next);
    handleSave(next);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground shadow-sm">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
              Bannière d'annonce globale
              {active && (
                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-success/15 text-success-text border border-success/30">
                  <Globe className="w-3 h-3 animate-pulse" /> En ligne
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground">
              Bandeau à courbure inversée suspendu en haut d'écran sur toutes les pages de lecture.
            </p>
          </div>
        </div>

        {/* Switch Diffusion en direct */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant={active ? 'solid' : 'soft'}
            tone={active ? 'success' : 'neutral'}
            onClick={handleToggleActive}
            disabled={isPending}
            className="cursor-pointer"
          >
            {active ? (
              <>
                <Eye className="w-3.5 h-3.5" /> Diffusion active
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" /> En pause (inactif)
              </>
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="solid"
            tone="brand"
            onClick={() => handleSave()}
            disabled={isPending}
            className="cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {isPending ? 'Enregistrement...' : 'Mettre à jour'}
          </Button>
        </div>
      </div>

      {feedback && (
        <p role="status" className="text-[11px] text-muted-foreground">
          {feedback} · audité
        </p>
      )}

      {/* Formulaire de configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Message de l'annonce
            </label>
            <Textarea
              rows={2}
              size="sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Texte court et percutant..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Style / Thème
              </label>
              <Select
                label="Type d'annonce"
                hideLabel
                value={type}
                onValueChange={(value) => setType(value as AnnouncementType)}
                options={[
                  { id: 'promo', label: 'Promo' },
                  { id: 'info', label: 'Info' },
                  { id: 'warning', label: 'Alerte' },
                  { id: 'critical', label: 'Urgent' },
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Texte du bouton
              </label>
              <Input
                type="text"
                size="sm"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Ex: Découvrir"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Lien cible (optionnel)
            </label>
            <Input
              type="text"
              size="sm"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Ex: /billing ou https://..."
            />
          </div>
        </div>

        {/* Prévisualisation interactive en direct */}
        <div className="flex flex-col justify-between rounded-xl border border-dashed border-border/80 bg-muted/30 p-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Aperçu fidèle en direct
              </span>
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                Courbure inversée C1
              </span>
            </div>
            <div className="relative h-28 w-full bg-muted/40 rounded-lg overflow-hidden border border-border/40 flex items-start justify-center pt-0">
              <div className="transform scale-90 origin-top">
                <InvertedCurveBanner
                  message={message || 'Votre annonce apparaîtra ici...'}
                  type={type}
                  linkUrl={linkUrl || undefined}
                  linkText={linkText || undefined}
                  dismissible={true}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-3 border-t border-border/40">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-success-text" /> Auto-mémorisé en
              localStorage lors de la fermeture
            </span>
            <span className="tabular-nums text-[10px]">{type.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
