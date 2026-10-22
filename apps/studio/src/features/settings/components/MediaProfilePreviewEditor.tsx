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
import Image from 'next/image';
import { t } from '@lingui/core/macro';
import {
  Building2,
  Camera,
  Globe,
  Mail,
  ExternalLink,
  Trash2,
  Sparkles,
  Link as LinkIcon,
  Check,
  Edit2,
  ShieldCheck,
} from 'lucide-react';
import { ImageUploader } from '@qoe/ui/ui/ImageUploader';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
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
    icon: Mail,
    getValue: (p) => p.supportUrl || '',
    setValue: (val, setCurrent) => setCurrent((prev) => ({ ...prev, supportUrl: val || null })),
  },
  {
    id: 'customDomain',
    label: 'Domaine web officiel',
    placeholder: 'mon-media.com',
    icon: Globe,
    getValue: (p) => p.customDomain || (p.subdomain ? `${p.subdomain}.qoe.fi` : ''),
    setValue: (val, setCurrent) => setCurrent((prev) => ({ ...prev, customDomain: val || null })),
  },
];

export function MediaProfilePreviewEditor({ current, setCurrent }: MediaProfilePreviewEditorProps) {
  const [activeMetadataModal, setActiveMetadataModal] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Upload manuel de la bannière
  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingBanner(true);
    try {
      const url = await uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.banners);
      setCurrent((prev) => ({ ...prev, headerImageUrl: url }));
    } catch (err) {
      console.error('Erreur upload bannière', err);
    } finally {
      setIsUploadingBanner(false);
    }
  };

  // Upload manuel du logo
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-md">
        {/* 1. Zone Bannière de Couverture */}
        <div className="relative w-full h-36 sm:h-44 bg-muted/40 group overflow-hidden">
          {current.headerImageUrl ? (
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
            <button
              type="button"
              disabled={isUploadingBanner}
              onClick={() => bannerInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/90 hover:bg-background text-foreground text-xs font-semibold backdrop-blur-md shadow-xs transition-all cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-primary" />
              <span>{isUploadingBanner ? 'Upload...' : 'Changer la bannière'}</span>
            </button>

            {current.headerImageUrl && (
              <button
                type="button"
                onClick={() => setCurrent((prev) => ({ ...prev, headerImageUrl: null }))}
                className="p-1.5 rounded-lg bg-background/90 hover:bg-destructive hover:text-white text-muted-foreground backdrop-blur-md shadow-xs transition-all cursor-pointer"
                title="Supprimer la bannière"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
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
              <div
                onClick={() => logoInputRef.current?.click()}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-card bg-muted/60 overflow-hidden shadow-lg flex items-center justify-center cursor-pointer relative transition-transform hover:scale-105"
                style={{ backgroundColor: accentColor }}
              >
                {current.logoUrl ? (
                  <img
                    src={current.logoUrl}
                    alt={current.name || 'Logo'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-black text-white">
                    {(current.name || 'M').charAt(0).toUpperCase()}
                  </span>
                )}

                {/* Overlay hover */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/logo:opacity-100 flex flex-col items-center justify-center text-white text-[10px] font-semibold transition-opacity gap-1">
                  <Camera className="w-4 h-4" />
                  <span>{isUploadingLogo ? 'Upload...' : 'Modifier'}</span>
                </div>
              </div>

              {current.logoUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrent((prev) => ({ ...prev, logoUrl: null }));
                  }}
                  className="absolute -top-1 -right-1 p-1 rounded-full bg-background border border-border/60 text-muted-foreground hover:text-destructive shadow-xs cursor-pointer opacity-0 group-hover/logo:opacity-100 transition-opacity"
                  title="Supprimer le logo"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Badge de statut Média */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Média Certifié</span>
              </span>
            </div>
          </div>

          {/* 3. Nom & Ligne éditoriale (Édition directe inline) */}
          <div className="space-y-3">
            {/* Titre / Nom du Média */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 group/title">
                <input
                  type="text"
                  value={current.name || ''}
                  onChange={(e) => setCurrent((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Nom du média (ex. L'Écho Indépendant)"
                  className="text-xl sm:text-2xl font-black text-foreground bg-transparent border-b border-transparent hover:border-border/60 focus:border-primary/80 focus:outline-none w-full transition-colors pb-0.5"
                />
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/title:opacity-60 shrink-0 pointer-events-none" />
              </div>
              <p className="text-xs text-muted-foreground font-mono">qoe.fi/m/{mediaSlug}</p>
            </div>

            {/* Description / Bio éditoriale du Média */}
            <div className="space-y-1 group/bio">
              <label className="text-[11px] font-semibold text-muted-foreground block">
                Ligne éditoriale du média (visible publiquement) :
              </label>
              <textarea
                value={current.heroText || ''}
                onChange={(e) => setCurrent((prev) => ({ ...prev, heroText: e.target.value }))}
                rows={2}
                placeholder="Décrivez en quelques mots la mission, les valeurs et les thématiques couvertes par votre média..."
                className="w-full text-xs sm:text-[13px] text-foreground bg-muted/20 hover:bg-muted/30 focus:bg-background border border-border/40 focus:border-primary/80 rounded-xl p-3 focus:outline-none resize-none transition-all leading-relaxed"
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
                      <button
                        type="button"
                        onClick={() => setActiveMetadataModal(field.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer',
                          value
                            ? 'border-border/50 bg-muted/20 hover:bg-muted/40 text-foreground'
                            : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
                        )}
                        title={`Modifier : ${field.label}`}
                      >
                        <IconComponent className="w-3.5 h-3.5 text-primary" />
                        <span className="truncate max-w-[200px]">
                          {value || `+ ${field.label}`}
                        </span>
                        <Edit2 className="w-3 h-3 opacity-40 ml-0.5" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 p-1 rounded-lg border border-primary/60 bg-background shadow-md animate-in fade-in zoom-in-95 duration-100">
                        <IconComponent className="w-3.5 h-3.5 text-primary ml-1 shrink-0" />
                        <input
                          type="text"
                          defaultValue={value}
                          autoFocus
                          placeholder={field.placeholder}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              field.setValue((e.target as HTMLInputElement).value, setCurrent);
                              setActiveMetadataModal(null);
                            } else if (e.key === 'Escape') {
                              setActiveMetadataModal(null);
                            }
                          }}
                          onBlur={(e) => {
                            field.setValue(e.target.value, setCurrent);
                            setActiveMetadataModal(null);
                          }}
                          className="px-2 py-0.5 text-xs text-foreground bg-transparent focus:outline-none min-w-[220px]"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setActiveMetadataModal(null)}
                          className="p-1 text-primary hover:bg-primary/10 rounded cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                        </button>
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
    </div>
  );
}
