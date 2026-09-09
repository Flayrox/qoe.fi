'use client';

// =====================================================================
// 📣 BroadcastAnnouncementConsole — Console Admin d'Annonce Globale
// =====================================================================
// Permet au superadmin de diffuser en temps réel une bannière de notification
// à courbure inversée sur l'ensemble de la plateforme.
// =====================================================================

import React, { useState, useTransition } from 'react';
import { Sparkles, Megaphone, Send, CheckCircle2, Globe, Eye, EyeOff } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { InvertedCurveBanner, type AnnouncementType } from '@qoe/ui';
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
    initialAnnouncement?.message ??
      'Bienvenue sur Qoe.fi ! Découvrez nos dernières fonctionnalités.'
  );
  const [type, setType] = useState<AnnouncementType>(initialAnnouncement?.type ?? 'promo');
  const [linkUrl, setLinkUrl] = useState(initialAnnouncement?.linkUrl ?? '');
  const [linkText, setLinkText] = useState(initialAnnouncement?.linkText ?? 'En savoir plus');
  const [isPending, startTransition] = useTransition();

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
        toast.success(
          nextActive
            ? '🚀 Annonce diffusée en direct sur la plateforme !'
            : 'Annonce désactivée avec succès.'
        );
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
    <div className="rounded-2xl border border-border/80 bg-white p-6 shadow-sm space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#130F26] text-[#A78BFA] shadow-sm">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              Bannière d'annonce globale
              {active && (
                <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-success/15 text-success border border-success/30">
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
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={isPending}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              active
                ? 'bg-success text-success-foreground shadow-md hover:bg-success/90'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {active ? (
              <>
                <Eye className="w-3.5 h-3.5" /> Diffusion Active
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" /> En pause (Inactif)
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#EE4B2B] text-white shadow-md hover:bg-[#EE4B2B]/90 transition-all cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {isPending ? 'Enregistrement...' : 'Mettre à jour'}
          </button>
        </div>
      </div>

      {/* Formulaire de configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Message de l'annonce
            </label>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Texte court et percutant..."
              className="w-full rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#EE4B2B] focus:outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Style / Thème
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AnnouncementType)}
                className="w-full rounded-xl border border-border bg-muted/20 px-3.5 py-2 text-xs text-foreground focus:border-[#EE4B2B] focus:outline-none transition-all cursor-pointer"
              >
                <option value="promo">Promo (Violet Hostinger)</option>
                <option value="info">Info (Bleu nuit)</option>
                <option value="warning">Alerte (Ambre)</option>
                <option value="critical">Urgent (Carmin)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Texte du bouton
              </label>
              <input
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Ex: Découvrir"
                className="w-full rounded-xl border border-border bg-muted/20 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#EE4B2B] focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Lien cible (optionnel)
            </label>
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Ex: /starter-packs ou https://..."
              className="w-full rounded-xl border border-border bg-muted/20 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#EE4B2B] focus:outline-none transition-all"
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
              <span className="text-[10px] text-muted-foreground bg-white px-2 py-0.5 rounded-full border border-border">
                Courbure inversée C1
              </span>
            </div>
            <div className="relative h-28 w-full bg-muted/40 rounded-lg overflow-hidden border border-border/40 flex items-start justify-center pt-0">
              {/* Le bandeau à courbure inversée s'affiche exactement comme en production */}
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
              <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Auto-mémorisé en localStorage
              lors de la fermeture
            </span>
            <span className="font-mono text-[10px]">{type.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
