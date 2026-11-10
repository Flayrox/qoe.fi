'use client';

// =====================================================================
// ⚡ apps/studio/src/features/settings/tabs/general.tsx
// =====================================================================
// Identité & Design : une seule carte par sujet, des lignes séparées par
// un filet. Plus de boîtes imbriquées autour du logo ou des switches.
// =====================================================================

import React, { useState } from 'react';
import { ColorPicker } from '@qoe/ui';
import { Button } from '@qoe/ui/button';
import { Input, Textarea } from '@qoe/ui/input';
import { Switch } from '@qoe/ui/switch';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import { ImageUploader } from '@qoe/ui/ui/ImageUploader';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import { cn } from '@qoe/utils';
import {
  Check,
  Globe,
  Image as ImageIcon,
  Palette,
  PenTool,
  SlidersHorizontal,
  User,
} from 'lucide-react';

import type { CreatorProfile } from '../types';
import { ACCENT_SWATCHES, SITE_FONTS } from '../types';
import { MediaProfilePreviewEditor } from '../components/MediaProfilePreviewEditor';
import { StudioField, StudioRow, StudioRowList, StudioSection } from '@/components/studio-page';

interface GeneralTabProps {
  current: CreatorProfile;
  setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>;
  consoleSettingsUrl?: string;
  publicBlogUrl?: string;
}

const DISPLAY_OPTIONS = [
  { key: 'showLogo', label: 'Logo / Avatar' },
  { key: 'showTagline', label: 'Slogan' },
  { key: 'showSubscribeButton', label: 'Bouton S’abonner' },
  { key: 'showCategoryTabs', label: 'Onglets rubriques' },
  { key: 'showCraftIndex', label: 'Sommaire' },
  { key: 'showProgressiveBlur', label: 'Flou progressif' },
  { key: 'showNewsletterWall', label: 'Mur newsletter' },
];

export function GeneralTab({ current, setCurrent }: GeneralTabProps) {
  const [identityScope, setIdentityScope] = useState<'tenant' | 'core'>('tenant');
  const isMedia = Boolean(current.isMedia);

  const activeFontId = current.fontFamily || 'sans';
  const activeColorHex = current.accentColor || '#EE4B2B';
  const isLogoSquare = Boolean(current.siteOptions?.logoShapeSquare);

  const toggleSiteOption = (key: string) => {
    setCurrent((prev) => {
      const existing = (prev.siteOptions?.[key] ?? true) !== false;
      return {
        ...prev,
        siteOptions: {
          ...(prev.siteOptions || {}),
          [key]: !existing,
        },
      };
    });
  };

  return (
    <div className="space-y-5">
      <Tabs
        variant="segmented"
        size="sm"
        value={identityScope}
        onValueChange={(value) => setIdentityScope(value as 'tenant' | 'core')}
      >
        <TabList aria-label="Portée des paramètres d'identité">
          <Tab id="tenant">
            <span className="inline-flex items-center gap-1.5">
              <Globe className="size-3.5" />
              <span>Site web</span>
            </span>
          </Tab>
          <Tab id="core">
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" />
              <span>{isMedia ? 'Profil du média' : 'Votre profil'}</span>
            </span>
          </Tab>
        </TabList>
      </Tabs>

      {identityScope === 'tenant' ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <StudioSection
              title="Identité du site"
              icon={PenTool}
              actions={
                current.subdomain ? (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {current.subdomain}.qoe.fi
                  </span>
                ) : null
              }
            >
              <div className="space-y-4">
                <StudioField label="Nom du site" htmlFor="site-name">
                  <Input
                    id="site-name"
                    type="text"
                    value={current.name || ''}
                    onChange={(event) =>
                      setCurrent((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="Carnet d'Éphémère"
                  />
                </StudioField>

                <StudioField
                  label="Slogan"
                  htmlFor="site-tagline"
                  counter={`${current.heroText?.length || 0}/180`}
                  hint="Une phrase affichée sous le nom."
                >
                  <Textarea
                    id="site-tagline"
                    size="sm"
                    rows={2}
                    maxLength={180}
                    value={current.heroText || ''}
                    onChange={(event) =>
                      setCurrent((prev) => ({ ...prev, heroText: event.target.value }))
                    }
                    placeholder="Analyses, essais et récits"
                  />
                </StudioField>
              </div>
            </StudioSection>

            <StudioSection title="Typographie et couleur" icon={Palette}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-foreground">Police</span>
                  <div className="grid grid-cols-2 gap-2">
                    {SITE_FONTS.map((font) => {
                      const isSelected = activeFontId === font.id;
                      return (
                        <Button
                          key={font.id}
                          variant={isSelected ? 'soft' : 'outline'}
                          tone={isSelected ? 'brand' : 'neutral'}
                          onClick={() => setCurrent((prev) => ({ ...prev, fontFamily: font.id }))}
                          className={cn(
                            'h-auto flex-col items-stretch justify-start gap-1 p-2.5 text-left',
                            isSelected && 'ring-1 ring-primary'
                          )}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-foreground">
                              {font.name}
                            </span>
                            {isSelected ? <Check className="size-3 shrink-0 text-primary" /> : null}
                          </span>
                          <span
                            style={{ fontFamily: font.family }}
                            className="truncate text-sm leading-tight text-muted-foreground"
                          >
                            Aa Bb Cc
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 border-t border-border/40 pt-4">
                  <span className="text-xs font-semibold text-foreground">Couleur d’accent</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {ACCENT_SWATCHES.map((swatch) => {
                      const isSelected = activeColorHex.toLowerCase() === swatch.hex.toLowerCase();
                      return (
                        <Button
                          key={swatch.id}
                          variant="ghost"
                          size="xs"
                          shape="icon"
                          onClick={() =>
                            setCurrent((prev) => ({ ...prev, accentColor: swatch.hex }))
                          }
                          title={swatch.name}
                          aria-label={swatch.name}
                          className={cn(
                            'size-6 rounded-full border-2 p-0 transition-transform',
                            isSelected
                              ? 'scale-110 border-foreground'
                              : 'border-transparent hover:scale-105'
                          )}
                          style={{ backgroundColor: swatch.hex }}
                        >
                          {isSelected ? (
                            <Check className="size-3 text-primary-foreground drop-shadow-sm" />
                          ) : null}
                        </Button>
                      );
                    })}

                    <div className="ml-1 flex items-center gap-1.5">
                      <Input
                        type="color"
                        size="xs"
                        value={activeColorHex}
                        onChange={(event) =>
                          setCurrent((prev) => ({ ...prev, accentColor: event.target.value }))
                        }
                        aria-label="Couleur personnalisée"
                        title="Couleur personnalisée"
                        className="size-6 cursor-pointer rounded-full border-border/50 bg-transparent p-0"
                      />
                      <span className="font-mono text-[11px] text-muted-foreground uppercase">
                        {activeColorHex}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border/40 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-foreground">Couleur de fond</span>
                    <span className="text-[10px] text-muted-foreground">
                      {current.siteOptions?.backgroundColor ? 'Personnalisée' : 'Par défaut'}
                    </span>
                  </div>
                  <ColorPicker
                    value={(current.siteOptions?.backgroundColor as string) || null}
                    onChange={(hex) =>
                      setCurrent((prev) => ({
                        ...prev,
                        siteOptions: {
                          ...(prev.siteOptions || {}),
                          backgroundColor: hex,
                        },
                      }))
                    }
                    defaultLabel="Thème neutre"
                  />
                </div>
              </div>
            </StudioSection>
          </div>

          <div className="space-y-5">
            <StudioSection title="Médias" icon={ImageIcon}>
              <StudioRowList>
                <StudioRow
                  title="Logo"
                  description="Affiché dans l’en-tête du site et comme favicon. PNG ou SVG, 512 × 512."
                >
                  <div className="w-44">
                    <ImageUploader
                      value={current.logoUrl}
                      onChange={(url) => setCurrent((prev) => ({ ...prev, logoUrl: url }))}
                      upload={(file) =>
                        uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars)
                      }
                      aspect={1}
                      shape={isLogoSquare ? 'square' : 'circle'}
                      maxDimension={512}
                    />
                  </div>
                </StudioRow>

                <StudioRow
                  title="Wordmark"
                  description="Remplace le nom texte dans l’en-tête du site. Laissez vide pour garder le nom."
                >
                  <div className="w-52">
                    <ImageUploader
                      value={(current.siteOptions?.wordmarkUrl as string | undefined) || null}
                      onChange={(url) =>
                        setCurrent((prev) => ({
                          ...prev,
                          siteOptions: { ...(prev.siteOptions || {}), wordmarkUrl: url },
                        }))
                      }
                      upload={(file) =>
                        uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.banners)
                      }
                      shape="banner"
                      aspect={4}
                      maxDimension={1600}
                    />
                  </div>
                </StudioRow>
              </StudioRowList>
            </StudioSection>

            <StudioSection title="Affichage" icon={SlidersHorizontal}>
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {DISPLAY_OPTIONS.map((option) => {
                  const isEnabled = (current.siteOptions?.[option.key] ?? true) !== false;
                  return (
                    <Switch
                      key={option.key}
                      size="sm"
                      isSelected={isEnabled}
                      onChange={() => toggleSiteOption(option.key)}
                      label={<span className="text-[11px] font-medium">{option.label}</span>}
                      className="items-center gap-2"
                    />
                  );
                })}
              </div>
            </StudioSection>
          </div>
        </div>
      ) : isMedia ? (
        <MediaProfilePreviewEditor current={current} setCurrent={setCurrent} />
      ) : (
        <div className="space-y-6 max-w-3xl">
          <StudioSection title="Identité de l'auteur" icon={User}>
            <StudioRowList>
              <StudioRow
                title="Bannière de profil"
                description="Image d'en-tête affichée sur votre profil public (ratio recommandé 21/9)."
              >
                <div className="w-64">
                  <ImageUploader
                    value={current.headerImageUrl}
                    onChange={(url) => setCurrent((prev) => ({ ...prev, headerImageUrl: url }))}
                    upload={(file) =>
                      uploadImageToRoute(file, '/api/upload', IMAGE_FOLDERS.banners)
                    }
                    shape="banner"
                    aspect={21 / 9}
                    maxDimension={1600}
                    label="Bannière"
                  />
                </div>
              </StudioRow>

              <StudioRow
                title="Photo de profil"
                description="Votre avatar public affiché sur vos articles et pensées."
              >
                <div className="size-20">
                  <ImageUploader
                    value={current.logoUrl}
                    onChange={(url) => setCurrent((prev) => ({ ...prev, logoUrl: url }))}
                    upload={(file) =>
                      uploadImageToRoute(file, '/api/upload', IMAGE_FOLDERS.avatars)
                    }
                    shape="circle"
                    aspect={1}
                    maxDimension={512}
                    label="Avatar"
                  />
                </div>
              </StudioRow>

              <StudioRow
                title="Nom complet"
                description="Nom public sous lequel vous écrivez et publiez vos articles."
              >
                <div className="max-w-md">
                  <Input
                    type="text"
                    value={current.name || ''}
                    onChange={(e) => setCurrent((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Votre nom"
                  />
                </div>
              </StudioRow>

              <StudioRow
                title="Biographie / Présentation"
                description="Une courte présentation affichée en haut de votre profil et sous vos articles."
              >
                <div className="max-w-md">
                  <Textarea
                    value={current.heroText || ''}
                    onChange={(e) => setCurrent((prev) => ({ ...prev, heroText: e.target.value }))}
                    placeholder="Décrivez-vous en quelques mots..."
                    rows={3}
                  />
                </div>
              </StudioRow>

              <StudioRow
                title="Localisation"
                description="Ville ou région affichée sur votre profil public."
              >
                <div className="max-w-md">
                  <Input
                    type="text"
                    value={
                      typeof current.siteOptions?.location === 'string'
                        ? (current.siteOptions.location as string)
                        : ''
                    }
                    onChange={(e) =>
                      setCurrent((prev) => ({
                        ...prev,
                        siteOptions: {
                          ...(prev.siteOptions || {}),
                          location: e.target.value || undefined,
                        },
                      }))
                    }
                    placeholder="Paris, France"
                  />
                </div>
              </StudioRow>

              <StudioRow
                title="Site web personnel"
                description="Lien externe vers votre portfolio ou site personnel."
              >
                <div className="max-w-md">
                  <Input
                    type="url"
                    value={
                      typeof current.siteOptions?.website === 'string'
                        ? (current.siteOptions.website as string)
                        : ''
                    }
                    onChange={(e) =>
                      setCurrent((prev) => ({
                        ...prev,
                        siteOptions: {
                          ...(prev.siteOptions || {}),
                          website: e.target.value || undefined,
                        },
                      }))
                    }
                    placeholder="https://mon-site.fr"
                  />
                </div>
              </StudioRow>
            </StudioRowList>
          </StudioSection>
        </div>
      )}
    </div>
  );
}
