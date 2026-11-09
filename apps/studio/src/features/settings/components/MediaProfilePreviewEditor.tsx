'use client';

// =====================================================================
// 🎭 apps/studio/src/features/settings/components/MediaProfilePreviewEditor.tsx
// =====================================================================
// Éditeur de profil de Média « Live Preview Intelligente & Simplifiée ».
// Rendu visuel direct et interactif : l'utilisateur modifie tout directement
// sur la carte (bannière, logo, titre, bio, liens) de manière intuitive.
//
// 💡 Conception data-driven :
// Pour ajouter ou retirer un champ de métadonnée du média à l'avenir,
// il suffit d'ajouter/retirer une entrée dans `MEDIA_METADATA_CONFIG`.
// =====================================================================

import React, { useRef, useState } from 'react';
import {
  Building2,
  Camera,
  Globe,
  Mail,
  MapPin,
  ExternalLink,
  Trash2,
  Check,
  Edit2,
  ShieldCheck,
} from 'lucide-react';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import {
  ImageEditorDialog,
  type ImageEditorPreset,
  type ImageEditorResult,
} from '@qoe/ui/ui/ImageEditorDialog';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input, Textarea } from '@qoe/ui/input';
import { cn } from '@qoe/utils';
import type { CreatorProfile } from '../types';

interface MediaProfilePreviewEditorProps {
  current: CreatorProfile;
  setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>;
}

/**
 * 💡 Définition data-driven des métadonnées extensibles du profil Média.
 * Permet d'ajouter ou retirer des champs simplement en modifiant cette liste.
 */
export interface MediaMetadataField {
  id: string;
  label: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
  getValue: (p: CreatorProfile) => string;
  setValue: (val: string, setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>) => void;
}

export const MEDIA_METADATA_CONFIG: MediaMetadataField[] = [
  {
    id: 'supportUrl',
    label: 'Contact / Support',
    placeholder: 'https://mon-media.fr/contact ou mailto:...',
    icon: ExternalLink,
    getValue: (p) => p.supportUrl || '',
    setValue: (val, setCurrent) => setCurrent((prev) => ({ ...prev, supportUrl: val || null })),
  },
  {
    id: 'location',
    label: 'Localisation',
    placeholder: 'Paris, France',
    icon: MapPin,
    getValue: (p) =>
      typeof p.siteOptions?.location === 'string' ? (p.siteOptions.location as string) : '',
    setValue: (val, setCurrent) =>
      setCurrent((prev) => ({
        ...prev,
        siteOptions: { ...(prev.siteOptions ?? {}), location: val || undefined },
      })),
  },
  {
    id: 'editorialEmail',
    label: 'Email rédactionnel',
    placeholder: 'redaction@mon-media.fr',
    icon: Mail,
    getValue: (p) => p.email || '',
    setValue: (val, setCurrent) => setCurrent((prev) => ({ ...prev, email: val })),
  },
  {
    id: 'customDomain',
    label: 'Site web public',
    placeholder: 'assez.qoe.fi',
    icon: Globe,
    getValue: (p) => p.customDomain || (p.subdomain ? `${p.subdomain}.qoe.fi` : ''),
    setValue: (_val, _setCurrent) => {
      // Le sous-domaine canonique et le domaine personnalisé se gèrent
      // dans l'onglet dédié « Domaine » pour préserver l'intégrité du tenant.
    },
  },
];

export function MediaProfilePreviewEditor({ current, setCurrent }: MediaProfilePreviewEditorProps) {
  const [activeMetadataModal, setActiveMetadataModal] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<string>('');
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [pendingMediaImage, setPendingMediaImage] = useState<{
    kind: 'banner' | 'logo';
    file: File;
    src: string;
  } | null>(null);

  const openImageEditor = (file: File | undefined, kind: 'banner' | 'logo') => {
    if (!file) return;
    const src = URL.createObjectURL(file);
    setPendingMediaImage((current) => {
      if (current) URL.revokeObjectURL(current.src);
      return { kind, file, src };
    });
  };

  const closeImageEditor = () => {
    setPendingMediaImage((current) => {
      if (current) URL.revokeObjectURL(current.src);
      return null;
    });
  };

  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    openImageEditor(e.target.files?.[0], 'banner');
    e.target.value = '';
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    openImageEditor(e.target.files?.[0], 'logo');
    e.target.value = '';
  };

  const handleApplyMediaImage = async ({ file }: ImageEditorResult) => {
    const kind = pendingMediaImage?.kind;
    if (!kind) return;
    closeImageEditor();

    if (kind === 'banner') {
      setIsUploadingBanner(true);
      try {
        const url = await uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.banners);
        setCurrent((prev) => ({ ...prev, headerImageUrl: url }));
      } catch (err) {
        console.error('Erreur upload bannière', err);
      } finally {
        setIsUploadingBanner(false);
      }
      return;
    }

    setIsUploadingLogo(true);
    try {
      const url = await uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars);
      setCurrent((prev) => ({ ...prev, logoUrl: url }));
    } catch (err) {
      console.error('Erreur upload logo', err);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const mediaPresets: ImageEditorPreset[] =
    pendingMediaImage?.kind === 'banner'
      ? [
          {
            id: 'banner',
            label: 'Bannière',
            aspect: 21 / 9,
            width: 1600,
            height: 686,
            shape: 'rect',
          },
        ]
      : [
          {
            id: 'logo',
            label: 'Logo',
            aspect: 1,
            width: 512,
            height: 512,
            shape: 'circle',
          },
        ];

  const accentColor = current.accentColor || '#EE4B2B';
  const mediaSlug = current.subdomain || current.username || 'media';

  return (
    <div className="max-w-3xl mx-auto space-y-4 select-none">
      {/* ── EN-TÊTE D'EXPLICATION ── */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Aperçu interactif du profil média
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Cliquez directement sur les éléments pour les modifier
        </span>
      </div>

      {/* ── CARTE DE PREVIEW PROFIL INTERACTIVE ── */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-md">
        {/* 1. Zone Bannière de Couverture */}
        <div className="relative w-full h-36 sm:h-44 bg-muted/40 group overflow-hidden">
          {current.headerImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL utilisateur distante arbitraire, non déclarable dans next.config.
            <img
              src={current.headerImageUrl}
              alt="Bannière du média"
              className="w-full h-full object-cover transition-transform group-hover:scale-[1.01]"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-xs font-medium text-white/80"
              style={{
                background: `linear-gradient(135deg, ${accentColor}cc 0%, #1e1e24 100%)`,
              }}
            >
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/20 backdrop-blur-md">
                <Camera className="w-3.5 h-3.5" />
                <span>Cliquez pour ajouter une bannière</span>
              </div>
            </div>
          )}

          {/* Boutons d'action sur la bannière */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            <input
              type="file"
              ref={bannerInputRef}
              onChange={handleBannerFileChange}
              accept="image/*"
              className="hidden"
            />
            <Button
              variant="soft"
              size="xs"
              loading={isUploadingBanner}
              onClick={() => bannerInputRef.current?.click()}
              className="bg-background/90 shadow-xs backdrop-blur-md hover:bg-background"
            >
              {!isUploadingBanner && <Camera className="text-primary" aria-hidden />}
              <span>{isUploadingBanner ? 'Upload...' : 'Changer la bannière'}</span>
            </Button>

            {current.headerImageUrl && (
              <Button
                variant="soft"
                tone="danger"
                size="xs"
                shape="icon"
                onClick={() => setCurrent((prev) => ({ ...prev, headerImageUrl: null }))}
                className="bg-background/90 shadow-xs backdrop-blur-md"
                aria-label="Supprimer la bannière"
                title="Supprimer la bannière"
              >
                <Trash2 aria-hidden />
              </Button>
            )}
          </div>
        </div>

        {/* 2. Zone Logo & Identité du média */}
        <div className="px-6 pb-6 pt-0 relative">
          {/* Avatar / Logo qui chevauche la bannière */}
          <div className="flex items-end justify-between -mt-12 sm:-mt-14 mb-4">
            <div className="relative group/logo">
              <input
                type="file"
                ref={logoInputRef}
                onChange={handleLogoFileChange}
                accept="image/*"
                className="hidden"
              />
              <Button
                variant="ghost"
                onClick={() => logoInputRef.current?.click()}
                aria-label={current.logoUrl ? 'Changer le logo' : 'Ajouter un logo'}
                className="relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-4 border-card bg-muted/60 p-0 shadow-lg transition-transform hover:scale-105 hover:bg-transparent sm:h-28 sm:w-28"
                style={{ backgroundColor: accentColor }}
              >
                {current.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL utilisateur distante arbitraire, non déclarable dans next.config.
                  <img
                    src={current.logoUrl}
                    alt={current.name || 'Logo'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-black text-white">
                    {(current.name || 'M').charAt(0).toUpperCase()}
                  </span>
                )}

                {/* Overlay hover */}
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover/logo:opacity-100">
                  <Camera className="size-4" aria-hidden />
                  <span>{isUploadingLogo ? 'Upload...' : 'Modifier'}</span>
                </span>
              </Button>

              {current.logoUrl && (
                <Button
                  variant="soft"
                  tone="danger"
                  size="xs"
                  shape="icon"
                  onClick={() => setCurrent((prev) => ({ ...prev, logoUrl: null }))}
                  className="absolute -top-1 -right-1 z-10 rounded-full border border-border/60 bg-background opacity-0 shadow-xs transition-opacity group-hover/logo:opacity-100"
                  aria-label="Supprimer le logo"
                  title="Supprimer le logo"
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>

            {/* Badge de statut Média */}
            <div className="flex items-center gap-2">
              <Badge variant="soft" tone="brand" size="sm" shape="pill" className="shadow-2xs">
                <ShieldCheck aria-hidden />
                <span>Média Certifié</span>
              </Badge>
            </div>
          </div>

          {/* 3. Nom & Ligne éditoriale (Édition directe inline) */}
          <div className="space-y-3">
            {/* Titre / Nom du Média */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 group/title">
                <Input
                  type="text"
                  value={current.name || ''}
                  onChange={(e) => setCurrent((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Nom du média (ex. L'Écho Indépendant)"
                  aria-label="Nom du média"
                  className="border-x-0 border-t-0 border-b border-transparent bg-transparent px-0 pb-0.5 text-xl font-black hover:border-border/60 focus-visible:border-primary/80 focus-visible:ring-0 sm:text-2xl"
                />
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/title:opacity-60 shrink-0 pointer-events-none" />
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                qoe.fi/{mediaSlug} {current.subdomain ? `· ${current.subdomain}.qoe.fi` : ''}
              </p>
            </div>

            {/* Description / Bio éditoriale du Média */}
            <div className="space-y-1 group/bio">
              <label className="text-[11px] font-semibold text-muted-foreground block">
                Ligne éditoriale du média (visible publiquement) :
              </label>
              <Textarea
                value={current.heroText || ''}
                onChange={(e) => setCurrent((prev) => ({ ...prev, heroText: e.target.value }))}
                rows={2}
                placeholder="Décrivez en quelques mots la mission, les valeurs et les thématiques couvertes par votre média..."
                aria-label="Ligne éditoriale du média"
                className="bg-muted/20 p-3 text-xs leading-relaxed hover:bg-muted/30 focus:bg-background sm:text-[13px]"
              />
            </div>

            {/* 4. Barre de métadonnées extensibles (Data-driven) */}
            <div className="pt-2 border-t border-border/30 flex items-center gap-3 flex-wrap">
              {MEDIA_METADATA_CONFIG.map((field) => {
                const IconComponent = field.icon;
                const value = field.getValue(current);
                const isEditing = activeMetadataModal === field.id;

                return (
                  <div key={field.id} className="relative">
                    {!isEditing ? (
                      <Button
                        variant={value ? 'soft' : 'outline'}
                        size="xs"
                        onClick={() => {
                          setActiveMetadataModal(field.id);
                          setEditingDraft(value);
                        }}
                        className={cn(
                          'max-w-full',
                          !value && 'border-dashed text-muted-foreground'
                        )}
                        title={`Modifier : ${field.label}`}
                      >
                        <IconComponent className="text-primary" aria-hidden />
                        <span className="max-w-[200px] truncate">
                          {value || `+ ${field.label}`}
                        </span>
                        <Edit2 className="ml-0.5 opacity-40" aria-hidden />
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5 p-1 rounded-lg border border-primary/60 bg-background shadow-md animate-in fade-in zoom-in-95 duration-100">
                        <IconComponent className="w-3.5 h-3.5 text-primary ml-1 shrink-0" />
                        <Input
                          type="text"
                          size="xs"
                          value={editingDraft}
                          onChange={(e) => setEditingDraft(e.target.value)}
                          autoFocus
                          placeholder={field.placeholder}
                          aria-label={field.label}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              field.setValue(editingDraft.trim(), setCurrent);
                              setActiveMetadataModal(null);
                            } else if (e.key === 'Escape') {
                              setActiveMetadataModal(null);
                            }
                          }}
                          onBlur={() => {
                            field.setValue(editingDraft.trim(), setCurrent);
                            setActiveMetadataModal(null);
                          }}
                          className="min-w-[220px] border-0 bg-transparent px-2 py-0.5 focus-visible:ring-0"
                        />
                        <Button
                          variant="ghost"
                          tone="brand"
                          size="xs"
                          shape="icon"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            field.setValue(editingDraft.trim(), setCurrent);
                            setActiveMetadataModal(null);
                          }}
                          aria-label={`Valider ${field.label}`}
                        >
                          <Check aria-hidden />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Réseaux sociaux connectés */}
              {current.socialLinks.length > 0 && (
                <div className="flex items-center gap-1.5 pl-2 border-l border-border/30">
                  {current.socialLinks.map((s) => (
                    <span
                      key={s.platform}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted/40 text-muted-foreground capitalize"
                    >
                      {s.platform}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ImageEditorDialog
        open={Boolean(pendingMediaImage)}
        onOpenChange={(open) => {
          if (!open) closeImageEditor();
        }}
        src={pendingMediaImage?.src ?? null}
        fileName={pendingMediaImage?.file.name}
        presets={mediaPresets}
        initialPresetId={pendingMediaImage?.kind === 'banner' ? 'banner' : 'logo'}
        title={pendingMediaImage?.kind === 'banner' ? 'Recadrer la bannière' : 'Recadrer le logo'}
        description="Ajustez le cadrage avant de remplacer l’image du média."
        onApply={handleApplyMediaImage}
      />
    </div>
  );
}
