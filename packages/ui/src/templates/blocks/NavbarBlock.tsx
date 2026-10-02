// =====================================================================
// 🧭 NavbarBlock.tsx — En-tête & Navigation Hiérarchique (Licorne 2026)
// =====================================================================
// Supporte :
// - Sous-menus déroulants via `NavigationItem.parentId`
// - 3 mises en page (spread, centered, split)
// - Affichage marque (logo, nom, ou les deux)
// - Actions sociales & bouton de soutien (Stripe / URL)
// - 100% Tokens sémantiques @qoe/theme
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowUpRight } from 'lucide-react';
import type { NavigationItem, SocialLink } from '@qoe/sdk/types';
import { SocialIcon } from '../../SocialIcon';
import type {
  NavbarBlockProps,
  TemplatePublicationContext,
  TemplateRenderContext,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';

type NavItemWithChildren = NavigationItem & { children?: NavigationItem[] };

interface NavbarBlockComponentProps {
  id: string;
  props: NavbarBlockProps;
  publication: TemplatePublicationContext;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
}

export function NavbarBlock({
  id,
  props,
  publication,
  context,
  visible = true,
  locked = false,
}: NavbarBlockComponentProps) {
  const {
    brandDisplay = 'logo-and-name',
    layout = 'spread',
    sticky = true,
    showSocial = true,
    showSupport = true,
    supportText = 'Nous soutenir',
    enableBlur = true,
  } = props;

  const {
    name,
    domain,
    subdomain,
    logoUrl,
    navigation = [],
    socialLinks = [],
    stripeAccountId,
    supportUrl,
  } = publication;

  const displayName = name || domain || subdomain || 'Mon Site Web';
  const supportLink = stripeAccountId ? '/support' : supportUrl || null;

  // Construction de l'arbre hiérarchique avec parentId
  const topLevelNav = navigation.filter((n) => !n.parentId);
  const nestedNav: NavItemWithChildren[] = topLevelNav
    .map((parent) => ({
      ...parent,
      children: navigation
        .filter((n) => n.parentId === parent.id)
        .sort((a, b) => a.order - b.order),
    }))
    .sort((a, b) => a.order - b.order);

  const containerClasses = [
    'w-full border-b border-border transition-colors duration-200',
    sticky ? 'sticky top-0 z-40' : 'relative z-20',
    enableBlur ? 'bg-background/80 backdrop-blur-md' : 'bg-background',
  ].join(' ');

  const innerLayoutClasses =
    layout === 'centered'
      ? 'flex flex-col items-center justify-center gap-3 py-4'
      : layout === 'split'
        ? 'flex items-center justify-between py-3.5'
        : 'flex items-center justify-between py-4';

  return (
    <BlockWrapper
      id={id}
      type="navbar"
      label="En-tête & Navigation"
      visible={visible}
      locked={locked}
      context={context}
    >
      <header className={containerClasses}>
        <div className={`container mx-auto px-4 lg:px-8 ${innerLayoutClasses}`}>
          {/* Logo et Nom du Site */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              onClick={(e) => context.mode === 'editable' && e.preventDefault()}
              className="flex items-center gap-3 group/brand transition-transform active:scale-98"
            >
              {logoUrl && brandDisplay !== 'name-only' && (
                <img
                  src={logoUrl}
                  alt={`${displayName} logo`}
                  className="w-9 h-9 md:w-11 md:h-11 rounded-xl object-cover shadow-sm group-hover/brand:opacity-90 transition-opacity"
                />
              )}
              {brandDisplay !== 'logo-only' && (
                <span className="text-lg md:text-xl font-bold tracking-tight text-foreground">
                  {displayName}
                </span>
              )}
            </Link>
          </div>

          {/* Navigation Principale avec Dropdowns Hiérarchiques */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {nestedNav.map((item) => {
              const hasChildren = item.children && item.children.length > 0;

              if (hasChildren) {
                return (
                  <div key={item.id} className="relative group/menu py-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex items-center gap-1"
                    >
                      <span>{item.label}</span>
                      <ChevronDown className="w-3.5 h-3.5 opacity-60 group-hover/menu:rotate-180 transition-transform duration-200" />
                    </button>

                    {/* Menu Déroulant Enfant */}
                    <div className="absolute top-full left-0 pt-1.5 opacity-0 translate-y-2 pointer-events-none group-hover/menu:opacity-100 group-hover/menu:translate-y-0 group-hover/menu:pointer-events-auto transition-all duration-200 z-50 min-w-[200px]">
                      <div className="bg-popover border border-border rounded-xl shadow-lg p-1.5 backdrop-blur-lg">
                        {item.children?.map((child) => (
                          <Link
                            key={child.id}
                            href={child.url || '/'}
                            target={child.isExternal ? '_blank' : '_self'}
                            onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                            className="flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <span>{child.label}</span>
                            {child.isExternal && <ArrowUpRight className="w-3 h-3 opacity-60" />}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  href={item.url || '/'}
                  target={item.isExternal ? '_blank' : '_self'}
                  onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Actions : Réseaux Sociaux & Bouton de Soutien */}
          <div className="flex items-center gap-3">
            {showSocial && socialLinks.length > 0 && (
              <div className="hidden lg:flex items-center gap-2 pr-2 border-r border-border">
                {socialLinks.slice(0, 4).map((social: SocialLink) => (
                  <Link
                    key={social.id}
                    href={social.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <SocialIcon platform={social.platform} className="w-4 h-4" />
                  </Link>
                ))}
              </div>
            )}

            {showSupport && supportLink && (
              <Link
                href={supportLink}
                onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                className="px-3.5 py-1.5 text-xs md:text-sm font-semibold text-white rounded-full transition-all shadow-sm active:scale-95 hover:opacity-95"
                style={{ backgroundColor: 'var(--tenant-accent, hsl(var(--primary)))' }}
              >
                {supportText}
              </Link>
            )}
          </div>
        </div>
      </header>
    </BlockWrapper>
  );
}
