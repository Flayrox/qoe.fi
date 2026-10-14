'use client';

// =====================================================================
// 📑 MinimalSidebarDrawer.tsx — Tiroir latéral Minimal Craft
// =====================================================================
// Caractéristiques d'orfèvre :
// 1. Déclenchement explicite au clic (AUCUN déploiement automatique au survol)
// 2. Section À propos du créateur / média (avatar, nom, bio, réseaux)
// 3. Section Catégories & Rubriques de navigation
// 4. Sommaire des chapitres avec tirets gradués Devouring Details (32px repos, 50px actif)
// 5. Bouton direct d'abonnement / soutien
// 6. Typographie proportionnelle suisse épurée (ZÉRO font-mono)
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { X, ArrowUpRight, Folder } from 'lucide-react';
import { cn } from '@qoe/utils';
import type { TemplatePublicationContext } from '../../schema';
import { SocialIcon } from '../../../SocialIcon';

export interface CraftDrawerItem {
  id: string;
  label: string;
  href?: string;
  number?: string | number;
  category?: string;
  isActive?: boolean;
}

export interface MinimalSidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  publication: TemplatePublicationContext;
  items: CraftDrawerItem[];
  activeId?: string;
  indicatorColor?: string;
  onSelectItem?: (item: CraftDrawerItem) => void;
  className?: string;
}

export function MinimalSidebarDrawer({
  isOpen,
  onClose,
  publication,
  items,
  activeId,
  indicatorColor = '#F97316',
  onSelectItem,
  className,
}: MinimalSidebarDrawerProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const {
    name,
    domain,
    subdomain,
    logoUrl,
    heroText,
    categories = [],
    socialLinks = [],
    stripeAccountId,
    supportUrl,
    siteOptions,
  } = publication;

  const displayName = name || domain || subdomain || 'Mon Carnet';
  const allowSocial = (siteOptions?.showSocialLinks ?? true) !== false;
  const allowSupport = (siteOptions?.showSubscribeButton ?? true) !== false;
  const supportLink = stripeAccountId ? '/support' : supportUrl || null;

  return (
    <>
      {/* Fond de masquage doux au clic */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-xs transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Panneau latéral coulissant */}
      <aside
        className={cn(
          'fixed top-0 left-0 bottom-0 z-50 w-full sm:w-[380px] bg-background/95 backdrop-blur-xl border-r border-border/50 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.23,0.88,0.26,0.92)] flex flex-col justify-between overflow-y-auto select-none',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          className
        )}
      >
        <div className="p-6 space-y-8">
          {/* ── Entête du tiroir ── */}
          <div className="flex items-center justify-between border-b border-border/30 pb-4">
            <div className="flex items-center gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                style={{ backgroundColor: indicatorColor }}
              />
              <span className="text-xs font-semibold text-foreground tracking-tight uppercase">
                Sommaire & À propos
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg border border-border/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              aria-label="Fermer le tiroir"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Section 1 : Profil / À propos du créateur ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={displayName}
                  className="w-10 h-10 rounded-full object-cover border border-border/40 shadow-2xs"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-2xs shrink-0"
                  style={{ backgroundColor: indicatorColor }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-foreground truncate tracking-tight">
                  {displayName}
                </h4>
                {domain && <p className="text-[11px] text-muted-foreground truncate">{domain}</p>}
              </div>
            </div>

            {heroText && (
              <p className="text-xs text-muted-foreground leading-relaxed font-sans pt-1">
                {heroText}
              </p>
            )}

            {allowSocial && socialLinks.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {socialLinks.map((link) => (
                  <a
                    key={link.id || link.platform}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg border border-border/40 bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                    title={link.platform}
                  >
                    <SocialIcon platform={link.platform} className="w-3.5 h-3.5" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* ── Section 2 : Rubriques & Catégories (si présentes) ── */}
          {categories.length > 0 && (
            <div className="space-y-2.5 border-t border-border/30 pt-6">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Rubriques
              </span>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <Link
                    key={cat.id || cat.slug}
                    href={`/category/${cat.slug}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted text-xs text-foreground/80 hover:text-foreground transition-all"
                  >
                    <Folder className="w-3 h-3 text-muted-foreground" />
                    <span>{cat.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── Section 3 : Sommaire des chapitres avec tirets de graduation ── */}
          <div className="space-y-3 border-t border-border/30 pt-6">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Chapitres & Notes ({items.length})
            </span>

            <div className="space-y-1 pl-1">
              {items.map((item, idx) => {
                const isActive = item.isActive || item.id === activeId;
                const isHovered = hoveredId === item.id;
                const highlight = isActive || isHovered;

                return (
                  <React.Fragment key={item.id}>
                    <div
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => {
                        if (onSelectItem) onSelectItem(item);
                        if (item.href) {
                          const hash = item.href.startsWith('#') ? item.href : `#${item.href}`;
                          const el = document.querySelector(hash);
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }
                        onClose();
                      }}
                      className="relative flex items-center gap-3 cursor-pointer py-1.5 group"
                    >
                      {/* Tiret gradué 32px au repos / 50px si actif */}
                      <span
                        className="block h-[1px] rounded-full transition-all duration-150 shrink-0"
                        style={{
                          width: highlight ? 50 : 32,
                          backgroundColor: highlight
                            ? indicatorColor
                            : 'var(--border, rgba(120,120,120,0.35))',
                        }}
                      />

                      <span
                        className={cn(
                          'text-xs tracking-tight truncate transition-colors duration-150',
                          highlight ? 'font-semibold text-foreground' : 'text-muted-foreground'
                        )}
                        style={{ color: highlight ? indicatorColor : undefined }}
                      >
                        {item.number && <span className="opacity-60 mr-1.5">{item.number}</span>}
                        {item.label}
                      </span>
                    </div>

                    {/* Tirets intercalaires fins */}
                    {idx < items.length - 1 && (
                      <div className="flex flex-col gap-1 py-0.5">
                        <span className="block h-[1px] w-4 rounded-full opacity-30 bg-border" />
                        <span className="block h-[1px] w-4 rounded-full opacity-30 bg-border" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Bas du tiroir : Action de soutien / abonnement ── */}
        {allowSupport && (
          <div className="p-6 border-t border-border/30 bg-muted/10">
            {supportLink ? (
              <a
                href={supportLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-2xs transition-transform active:scale-98"
                style={{ backgroundColor: indicatorColor }}
              >
                <span>Soutenir la publication</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            ) : (
              <div className="text-center">
                <span className="text-[11px] text-muted-foreground">
                  Lecture souveraine sans pistage
                </span>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
