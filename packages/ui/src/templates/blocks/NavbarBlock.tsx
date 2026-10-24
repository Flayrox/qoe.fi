// =====================================================================
// NavbarBlock.tsx — En-tête et navigation
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
import { ChevronDown, ArrowUpRight, Search } from 'lucide-react';
import type { SocialLink } from '@qoe/sdk/types';
import { SocialIcon } from '../../SocialIcon';
import type {
  NavbarBlockProps,
  TemplatePublicationContext,
  TemplateRenderContext,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';
import { EditableText } from './EditableText';
import { NodeRenderer } from './NodeRenderer';
import { resolveTenantNavigation } from '../navigation';

interface NavbarBlockComponentProps {
  id: string;
  props: NavbarBlockProps;
  publication: TemplatePublicationContext;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
  slots?: Record<string, import('../schema').TemplateNode[]>;
  nodes?: import('../schema').TemplateNode[];
  hiddenAt?: ('mobile' | 'tablet')[];
}

export function NavbarBlock({
  id,
  props,
  publication,
  context,
  visible = true,
  locked = false,
  slots,
  nodes,
  hiddenAt,
}: NavbarBlockComponentProps) {
  const {
    brandDisplay = 'logo-and-name',
    layout = 'spread',
    sticky = true,
    showSocial = true,
    showSupport = true,
    supportText = 'Soutenir',
    enableBlur = false,
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
    siteOptions,
  } = publication;

  const allowLogo = (siteOptions?.showLogo ?? true) !== false;
  const allowSocial = (siteOptions?.showSocialLinks ?? true) !== false;
  const allowSupport = (siteOptions?.showSubscribeButton ?? true) !== false;

  const effectiveShowSocial = showSocial && allowSocial;
  const effectiveShowSupport = showSupport && allowSupport;

  const displayName = name || domain || subdomain || 'Mon Site Web';
  const supportLink = stripeAccountId ? '/support' : supportUrl || null;

  // Résolution souveraine et unifiée de la navigation (rubriques + liens externes + pages)
  const { navItems: nestedNav } = resolveTenantNavigation({
    categories: publication.categories,
    navigation,
    siteOptions,
    publicationId: publication.id,
    includePages: true,
  });

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
      styleBox={
        (
          props as unknown as {
            styleBox?: { pt?: number; pb?: number; maxWidth?: number; opacity?: number };
          }
        ).styleBox
      }
      blockStyle={(props as unknown as { style?: import('../schema').BlockStyleProps }).style}
      hiddenAt={hiddenAt}
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
              {logoUrl && allowLogo && brandDisplay !== 'name-only' && (
                <img
                  src={logoUrl}
                  alt={`${displayName} logo`}
                  className="w-9 h-9 md:w-11 md:h-11 rounded-md object-cover transition-opacity"
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
                      <div className="bg-popover border border-border rounded-lg shadow-md p-1.5">
                        {item.children?.map((child) => {
                          const isMail = child.isMail || child.url?.startsWith('mailto:');
                          return (
                            <Link
                              key={child.id}
                              href={child.url || '/'}
                              target={child.isExternal && !isMail ? '_blank' : undefined}
                              onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                              className="flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <span>{child.label}</span>
                              {child.isExternal && !isMail && (
                                <ArrowUpRight className="w-3 h-3 opacity-60" />
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              const isMail = item.isMail || item.url?.startsWith('mailto:');
              return (
                <Link
                  key={item.id}
                  href={item.url || '/'}
                  target={item.isExternal && !isMail ? '_blank' : undefined}
                  onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Actions : Recherche, Réseaux Sociaux & Bouton de Soutien */}
          <div className="flex items-center gap-3">
            <Link
              href="/search"
              onClick={(e) => context.mode === 'editable' && e.preventDefault()}
              title="Rechercher"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Search className="w-4 h-4" />
            </Link>
            {effectiveShowSocial && socialLinks.length > 0 && (
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

            {effectiveShowSupport && supportLink && (
              <Link
                href={supportLink}
                onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                className="px-3.5 py-1.5 text-xs md:text-sm font-semibold text-primary-foreground rounded-lg transition-colors shadow-xs"
                style={{ backgroundColor: 'var(--tenant-accent, hsl(var(--primary)))' }}
              >
                <EditableText
                  blockId={id}
                  propKey="supportText"
                  value={supportText || 'Soutenir'}
                  context={context}
                  as="span"
                  multiline={false}
                />
              </Link>
            )}
            {slots?.actions && (
              <div className="hidden md:flex items-center gap-2">
                <NodeRenderer
                  nodes={slots.actions}
                  blockId={id}
                  blockProps={props as unknown as Record<string, unknown>}
                  context={context}
                  path="slots/actions"
                />
              </div>
            )}
            {nodes && nodes.length > 0 && (
              <NodeRenderer
                nodes={nodes}
                blockId={id}
                blockProps={props as unknown as Record<string, unknown>}
                context={context}
                path="nodes"
              />
            )}
          </div>
        </div>
      </header>
    </BlockWrapper>
  );
}
