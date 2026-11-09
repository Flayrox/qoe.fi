'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { Button } from '@qoe/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { Input, Textarea } from '@qoe/ui/input';
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
    onboardingText?: string | null | undefined;
  }
): Promise<{ ok: boolean; data?: { user: UpdatedUser } }> {
  try {
    await updateMediaProfileAction(mediaId, {
      name: input.name,
      heroText: input.heroText,
      logoUrl: input.logoUrl ?? null,
      headerImageUrl: input.headerImageUrl ?? null,
      siteOptions:
        input.onboardingText !== undefined ? { location: input.onboardingText } : undefined,
    });
    return {
      ok: true,
      data: {
        user: {
          id: mediaId,
          name: input.name ?? null,
          logoUrl: (input.logoUrl ?? null) as string | null,
          headerImageUrl: (input.headerImageUrl ?? null) as string | null,
          heroText: input.heroText ?? null,
          onboardingText: input.onboardingText ?? null,
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const mediaId = publicationId ? await resolveMediaId(publicationId) : null;
      const res = mediaId
        ? await updateMediaProfile(mediaId, {
            name,
            heroText,
            logoUrl,
            headerImageUrl,
            onboardingText: locationText,
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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t`Éditer le profil`}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex flex-col min-h-0">
          <DialogBody className="space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Banner Upload */}
            <div className="space-y-2">
              <ImageUploader
                value={headerImageUrl}
                onChange={setHeaderImageUrl}
                upload={(file) => uploadImageToRoute(file, '/api/upload', IMAGE_FOLDERS.banners)}
                aspect={21 / 9}
                shape="banner"
                maxDimension={1600}
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
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t`Votre nom`}
                required
              />
            </div>

            {/* Bio Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                {t`Bio / Présentation`}
              </label>
              <Textarea
                value={heroText}
                onChange={(e) => setHeroText(e.target.value)}
                placeholder={t`Décrivez-vous en quelques mots...`}
                rows={3}
              />
            </div>

            {/* Location Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                {t`Localisation / Ville`}
              </label>
              <Input
                type="text"
                value={locationText}
                maxLength={30}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder={t`Paris, France`}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t`Annuler`}
            </Button>
            <Button
              type="submit"
              variant="solid"
              tone="neutral"
              size="sm"
              disabled={saving || !name.trim()}
            >
              {saving && <Loader2 className="animate-spin" />}
              <span>{t`Enregistrer`}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
