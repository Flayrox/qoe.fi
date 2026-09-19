'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { updateProfileAction as updateProfile } from '@qoe/sdk/actions/feed';
import { updateMediaProfileAction, resolveMediaIdByPublication } from './profile-edit-actions';

import { ImageUploader } from '@qoe/ui/ui/ImageUploader';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import { t } from '@lingui/core/macro';

interface UpdatedUser {
  id: string;
  name: string | null;
  username?: string | null;
  logoUrl: string | null;
  headerImageUrl?: string | null;
  heroText: string | null;
  onboardingText?: string | null;
}

/**
 * Écrit les réglages d'un profil de MÉDIA via sa server action dédiée
 * (PATCH /v1/media/{id}/settings, RBAC media:manage_settings côté Go).
 * Ne touche JAMAIS au compte utilisateur ni à une autre publication.
 */
async function updateMediaProfile(
  mediaId: string,
  input: {
    name?: string;
    heroText?: string;
    logoUrl?: string | null | undefined;
    headerImageUrl?: string | null | undefined;
  }
): Promise<{ ok: boolean; data?: { user: UpdatedUser } }> {
  try {
    await updateMediaProfileAction(mediaId, {
      name: input.name,
      heroText: input.heroText,
      logoUrl: input.logoUrl ?? null,
      headerImageUrl: input.headerImageUrl ?? null,
    });
    return {
      ok: true,
      data: {
        user: {
          id: mediaId,
          name: input.name ?? null,
          // Pas de username ici : un média n'en a pas, et il ne faut surtout
          // pas écraser le slug affiché par l'état parent.
          logoUrl: (input.logoUrl ?? null) as string | null,
          headerImageUrl: (input.headerImageUrl ?? null) as string | null,
          heroText: input.heroText ?? null,
        },
      },
    };
  } catch {
    return { ok: false };
  }
}

/**
 * Profil personnel : l'action SDK patche /v1/me/profile (compte) ET
 * /v1/settings/profile ciblant la publication PERSONNELLE (scope 'personal',
 * résolue côté serveur) — jamais la publication « active » du cookie, qui peut
 * pointer vers un Média (bug du 19/09 dans l'autre sens : le média se serait
 * fait écraser par le profil personnel).
 */
async function updatePersonalProfile(input: {
  name?: string;
  heroText?: string;
  onboardingText?: string;
  logoUrl?: string | null | undefined;
  headerImageUrl?: string | null | undefined;
}): Promise<{ ok: boolean; data?: { user: UpdatedUser } }> {
  try {
    const profile = await updateProfile({ ...input, scope: 'personal' });
    if (!profile.ok) return { ok: false };
    return { ok: true, data: { user: profile.data.user } };
  } catch {
    return { ok: false };
  }
}

/**
 * Résout ce que représente la publication affichée : l'id du média si c'en est
 * un (via le endpoint dédié), sinon null → profil personnel. La résolution est
 * faite par une server action : le client ne devine jamais l'identifiant.
 */
const resolveMediaId = (publicationId: string) => resolveMediaIdByPublication(publicationId);

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    headerImageUrl?: string | null;
    heroText: string | null;
    onboardingText?: string | null;
  };
  /**
   * 🎯 Ressource réellement éditée. ⚠️ BUG du 19/09 : le modal ne connaissait
   * qu'une seule action, qui patchait /v1/me/profile (profil PERSONNEL) en plus
   * de la publication — ouvert depuis le profil d'un Média, il a écrasé le nom
   * ET l'username du compte utilisateur. Depuis, la cible est résolue côté
   * serveur : si publicationId correspond à un Média → PATCH /v1/media/{id}/
   * settings (RBAC côté Go) ; sinon → profil du compte + publication perso.
   */
  publicationId?: string | null;
  onProfileUpdated?: (updatedUser: UpdatedUser) => void;
}

export function EditProfileModal({
  isOpen,
  onClose,
  user,
  publicationId,
  onProfileUpdated,
}: EditProfileModalProps) {
  const [name, setName] = useState(user.name || '');
  const [heroText, setHeroText] = useState(user.heroText || '');
  const [locationText, setLocationText] = useState(user.onboardingText || '');
  const [logoUrl, setLogoUrl] = useState<string | null>(user.logoUrl);
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(user.headerImageUrl || null);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // 🎯 Une seule cible d'écriture : on résout ce que représente la
      // publication affichée (média ou compte personnel) côté serveur. Un
      // média n'a ni username ni onboardingText : ces champs ne partent que
      // vers /v1/me/profile (compte personnel).
      const mediaId = publicationId ? await resolveMediaId(publicationId) : null;
      // ⚠️ null est SIGNIFICATIF (retrait de photo) : on le transmet tel quel,
      // jamais `|| undefined` qui le transformerait en champ omis → le retrait
      // ne partirait jamais côté Go.
      const res = mediaId
        ? await updateMediaProfile(mediaId, {
            name,
            heroText,
            logoUrl,
            headerImageUrl,
          })
        : await updatePersonalProfile({
            name,
            heroText,
            onboardingText: locationText,
            logoUrl,
            headerImageUrl,
          });
      if (res.ok && res.data?.user) {
        toast.success(t`Profil mis à jour avec succès !`);
        if (onProfileUpdated) {
          const u = res.data.user;
          onProfileUpdated({
            id: u.id,
            name: u.name,
            username: u.username,
            logoUrl: u.logoUrl,
            heroText:
              (u as { publication?: { heroText?: string | null } }).publication?.heroText ?? null,
            headerImageUrl:
              (u as { publication?: { headerImageUrl?: string | null } }).publication
                ?.headerImageUrl ?? null,
            onboardingText: u.onboardingText,
          });
        }
        onClose();
      } else {
        toast.error(t`Erreur lors de la mise à jour.`);
      }
    } catch (err) {
      console.error(err);
      toast.error(t`Erreur de mise à jour.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-card text-card-foreground border border-border/40 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col font-sans"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
            <h3 className="font-semibold text-base text-foreground">{t`Éditer le profil`}</h3>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSave} className="p-5 space-y-5 overflow-y-auto max-h-[80vh]">
            {/* Banner Upload */}
            <div className="space-y-2">
              <ImageUploader
                value={headerImageUrl}
                onChange={setHeaderImageUrl}
                upload={(file) => uploadImageToRoute(file, '/api/upload', IMAGE_FOLDERS.banners)}
                aspect={21 / 9}
                shape="banner"
                label={t`Bannière`}
              />
            </div>

            {/* Avatar Upload */}
            <div className="space-y-2">
              <ImageUploader
                value={logoUrl}
                onChange={setLogoUrl}
                upload={(file) => uploadImageToRoute(file, '/api/upload', IMAGE_FOLDERS.avatars)}
                aspect={1}
                shape="circle"
                maxDimension={512}
                label={t`Photo de profil`}
              />
            </div>

            {/* Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">{t`Nom complet`}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t`Votre nom`}
                required
                className="w-full text-sm border border-border/50 focus:border-foreground bg-muted/30 focus:bg-card text-foreground rounded-lg p-2.5 outline-none transition-all font-medium"
              />
            </div>

            {/* Bio Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                {t`Bio / Présentation`}
              </label>
              <textarea
                value={heroText}
                onChange={(e) => setHeroText(e.target.value)}
                placeholder={t`Décrivez-vous en quelques mots...`}
                rows={3}
                className="w-full text-xs border border-border/50 focus:border-foreground bg-muted/30 focus:bg-card text-foreground rounded-lg p-2.5 resize-none outline-none transition-all"
              />
            </div>

            {/* Location Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                {t`Localisation / Ville`}
              </label>
              <input
                type="text"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder={t`Paris, France`}
                className="w-full text-xs border border-border/50 focus:border-foreground bg-muted/30 focus:bg-card text-foreground rounded-lg p-2.5 outline-none transition-all"
              />
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {t`Annuler`}
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="px-5 py-2 bg-foreground text-background text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t`Enregistrer`}</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
