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
  pronouns?: string | null;
  website?: string | null;
  supportUrl?: string | null;
  socialLinks?: Array<{ platform: string; url: string }> | null;
}

const SOCIAL_NETWORKS = [
  { id: 'twitter', label: 'X (Twitter)', placeholder: 'https://x.com/...' },
  { id: 'bluesky', label: 'Bluesky', placeholder: 'https://bsky.app/profile/...' },
  { id: 'github', label: 'GitHub', placeholder: 'https://github.com/...' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/...' },
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
];

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
    supportUrl?: string | null | undefined;
    website?: string | null | undefined;
    socialLinks?: Array<{ platform: string; url: string }> | undefined;
  }
): Promise<{ ok: boolean; data?: { user: UpdatedUser } }> {
  try {
    await updateMediaProfileAction(mediaId, {
      name: input.name,
      heroText: input.heroText,
      logoUrl: input.logoUrl ?? null,
      headerImageUrl: input.headerImageUrl ?? null,
      supportUrl: input.supportUrl ?? null,
      siteOptions: {
        ...(input.onboardingText !== undefined ? { location: input.onboardingText } : {}),
        ...(input.website !== undefined ? { website: input.website } : {}),
        ...(input.socialLinks !== undefined ? { socialLinks: input.socialLinks } : {}),
      },
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
          supportUrl: input.supportUrl ?? null,
          website: input.website ?? null,
          socialLinks: input.socialLinks ?? null,
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
  pronouns?: string;
  website?: string;
  socialLinks?: Array<{ platform: string; url: string }>;
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
    type?: 'PERSONAL' | 'MEDIA';
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    headerImageUrl?: string | null;
    heroText: string | null;
    onboardingText?: string | null;
    pronouns?: string | null;
    website?: string | null;
    supportUrl?: string | null;
    socialLinks?: Array<{ platform: string; url: string }> | null;
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
  const isMedia = user.type === 'MEDIA';
  const [name, setName] = useState(user.name || '');
  const [heroText, setHeroText] = useState(user.heroText || '');
  const [locationText, setLocationText] = useState(user.onboardingText || '');
  const [pronouns, setPronouns] = useState(user.pronouns || '');
  const [website, setWebsite] = useState(user.website || '');
  const [supportUrl, setSupportUrl] = useState(user.supportUrl || '');
  const [logoUrl, setLogoUrl] = useState<string | null>(user.logoUrl);
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(user.headerImageUrl || null);
  const [socialUrls, setSocialUrls] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (user.socialLinks) {
      for (const s of user.socialLinks) {
        if (s.platform && s.url) map[s.platform] = s.url;
      }
    }
    return map;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const activeSocialLinks = Object.entries(socialUrls)
      .map(([platform, url]) => ({ platform, url: url.trim() }))
      .filter((s) => s.url !== '');

    try {
      const mediaId = publicationId ? await resolveMediaId(publicationId) : null;
      const res = mediaId
        ? await updateMediaProfile(mediaId, {
            name,
            heroText,
            logoUrl,
            headerImageUrl,
            supportUrl: supportUrl || null,
            onboardingText: locationText,
            socialLinks: activeSocialLinks,
          })
        : await updatePersonalProfile({
            name,
            heroText,
            onboardingText: locationText,
            pronouns: pronouns || undefined,
            website: website || undefined,
            logoUrl,
            headerImageUrl,
            socialLinks: activeSocialLinks,
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
              (u as { publication?: { heroText?: string | null } }).publication?.heroText ??
              u.heroText ??
              null,
            headerImageUrl:
              (u as { publication?: { headerImageUrl?: string | null } }).publication
                ?.headerImageUrl ??
              u.headerImageUrl ??
              null,
            onboardingText: u.onboardingText,
            pronouns: u.pronouns,
            website: u.website,
            supportUrl: u.supportUrl,
            socialLinks: u.socialLinks,
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
          <DialogTitle>{isMedia ? t`Éditer le profil média` : t`Éditer le profil`}</DialogTitle>
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
                shape={isMedia ? 'square' : 'circle'}
                maxDimension={512}
                label={isMedia ? t`Logo du média` : t`Photo de profil`}
              />
            </div>

            {/* Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                {isMedia ? t`Nom du média` : t`Nom complet`}
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isMedia ? t`Nom de votre publication` : t`Votre nom`}
                required
              />
            </div>

            {/* Pronouns (only for personal) */}
            {!isMedia && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  {t`Pronoms (optionnel)`}
                </label>
                <Input
                  type="text"
                  value={pronouns}
                  maxLength={24}
                  onChange={(e) => setPronouns(e.target.value)}
                  placeholder={t`ex: iel, elle/iel, il`}
                />
              </div>
            )}

            {/* Bio Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                {isMedia ? t`Ligne éditoriale / Slogan` : t`Bio / Présentation`}
              </label>
              <Textarea
                value={heroText}
                onChange={(e) => setHeroText(e.target.value)}
                placeholder={
                  isMedia
                    ? t`Présentez la mission et le positionnement du média...`
                    : t`Décrivez-vous en quelques mots...`
                }
                rows={3}
              />
            </div>

            {/* Location Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                {isMedia ? t`Siège / Rédaction` : t`Localisation / Ville`}
              </label>
              <Input
                type="text"
                value={locationText}
                maxLength={40}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder={isMedia ? t`Paris, France` : t`Paris, France`}
              />
            </div>

            {/* Website / Support Link */}
            {isMedia ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  {t`Lien de contact / Support`}
                </label>
                <Input
                  type="url"
                  value={supportUrl}
                  onChange={(e) => setSupportUrl(e.target.value)}
                  placeholder="https://mon-media.fr/contact"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  {t`Site web personnel / Portfolio`}
                </label>
                <Input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://mon-site.fr"
                />
              </div>
            )}

            {/* Social Networks Section */}
            <div className="space-y-2 pt-2 border-t border-border/40">
              <label className="text-xs font-semibold text-muted-foreground">
                {t`Réseaux sociaux & Profils`}
              </label>
              <div className="space-y-2">
                {SOCIAL_NETWORKS.map((net) => (
                  <div key={net.id} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs font-medium text-foreground/80">
                      {net.label}
                    </span>
                    <Input
                      type="url"
                      size="sm"
                      value={socialUrls[net.id] || ''}
                      onChange={(e) =>
                        setSocialUrls((prev) => ({ ...prev, [net.id]: e.target.value }))
                      }
                      placeholder={net.placeholder}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
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
