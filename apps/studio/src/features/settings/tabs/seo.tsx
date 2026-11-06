'use client';

// =====================================================================
// ⚡ apps/studio/src/features/settings/tabs/seo.tsx
// =====================================================================

import React from 'react';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { Input, Textarea } from '@qoe/ui/input';
import { Switch } from '@qoe/ui/switch';
import { Plus, Trash2 } from 'lucide-react';
import type { CreatorProfile } from '../types';
import { SUPPORTED_SOCIAL_PLATFORMS } from '../types';
import { SeoPreview } from '../components/seo-preview';
import { StudioField, StudioRowList, StudioSection } from '@/components/studio-page';

interface SeoTabProps {
  current: CreatorProfile;
  setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>;
  addSocialLink: (platform: string) => void;
  removeSocialLink: (idx: number) => void;
}

export function SeoTab({ current, setCurrent, addSocialLink, removeSocialLink }: SeoTabProps) {
  const availablePlatforms = SUPPORTED_SOCIAL_PLATFORMS.filter(
    (platform) => !current.socialLinks.some((link) => link.platform === platform.id)
  );

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-7">
        <StudioSection title="Référencement">
          <div className="space-y-5">
            <StudioField
              label="Titre"
              htmlFor="seo-title"
              counter={`${current.seoTitle?.length || 0}/60`}
              hint="Affiché comme titre du lien dans les résultats de recherche. Laissez vide pour utiliser le nom du site."
            >
              <Input
                id="seo-title"
                type="text"
                value={current.seoTitle || ''}
                onChange={(event) =>
                  setCurrent((prev) => ({ ...prev, seoTitle: event.target.value }))
                }
                placeholder={t`Le Carnet de Sarah`}
              />
            </StudioField>

            <StudioField
              label="Description"
              htmlFor="seo-description"
              counter={`${current.seoDescription?.length || 0}/160`}
              hint="Affichée sous le titre. Laissez vide pour reprendre le slogan du site."
            >
              <Textarea
                id="seo-description"
                size="sm"
                rows={3}
                value={current.seoDescription || ''}
                onChange={(event) =>
                  setCurrent((prev) => ({ ...prev, seoDescription: event.target.value }))
                }
                placeholder={t`En une phrase, ce que publie le site.`}
              />
            </StudioField>

            <div className="border-t border-border/40 pt-4">
              <Switch
                id="allow-indexing"
                isSelected={current.allowIndexing}
                onChange={(checked) => setCurrent((prev) => ({ ...prev, allowIndexing: checked }))}
                label={t`Autoriser l'indexation`}
                description={t`Si cette option est désactivée, les moteurs de recherche ne référencent pas le site.`}
              />
            </div>
          </div>
        </StudioSection>

        <StudioSection title="Pied de page">
          <StudioField
            label="Mention"
            htmlFor="footer-text"
            hint={t`Affichée en bas de chaque page du site.`}
          >
            <Textarea
              id="footer-text"
              size="sm"
              rows={2}
              value={current.footerText || ''}
              onChange={(event) =>
                setCurrent((prev) => ({ ...prev, footerText: event.target.value }))
              }
              placeholder={t`Tous droits réservés.`}
            />
          </StudioField>
        </StudioSection>

        <StudioSection title="Réseaux sociaux">
          <p className="mb-3 text-xs text-muted-foreground">
            {t`Les profils renseignés apparaissent sur le site.`}
          </p>

          {availablePlatforms.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availablePlatforms.map((platform) => (
                <Button
                  key={platform.id}
                  variant="outline"
                  size="xs"
                  onClick={() => addSocialLink(platform.id)}
                >
                  <Plus />
                  <span>{platform.name}</span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t`Tous les profils pris en charge sont renseignés.`}
            </p>
          )}

          {current.socialLinks.length > 0 ? (
            <StudioRowList className="mt-4">
              {current.socialLinks.map((link, index) => {
                const platformLabel =
                  SUPPORTED_SOCIAL_PLATFORMS.find((platform) => platform.id === link.platform)
                    ?.name ?? link.platform;
                return (
                  <div
                    key={link.platform}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="w-20 shrink-0 truncate text-xs font-medium text-foreground">
                      {platformLabel}
                    </span>
                    <Input
                      type="url"
                      size="sm"
                      value={link.url}
                      aria-label={t`URL du profil ${platformLabel}`}
                      placeholder="https://..."
                      onChange={(event) => {
                        const updated = [...current.socialLinks];
                        updated[index] = { ...updated[index], url: event.target.value };
                        setCurrent((prev) => ({ ...prev, socialLinks: updated }));
                      }}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      tone="danger"
                      size="xs"
                      shape="icon"
                      onClick={() => removeSocialLink(index)}
                      title={t`Retirer ${platformLabel}`}
                      aria-label={t`Retirer ${platformLabel}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </StudioRowList>
          ) : null}
        </StudioSection>
      </div>

      <div className="lg:sticky lg:top-28 lg:col-span-5">
        <SeoPreview
          name={current.name}
          subdomain={current.subdomain}
          customDomain={current.customDomain}
          seoTitle={current.seoTitle}
          seoDescription={current.seoDescription}
          heroText={current.heroText}
          headerImageUrl={current.headerImageUrl}
          logoUrl={current.logoUrl}
          allowIndexing={current.allowIndexing}
        />
      </div>
    </div>
  );
}
