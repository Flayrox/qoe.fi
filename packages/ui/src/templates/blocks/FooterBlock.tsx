// =====================================================================
// FooterBlock.tsx — Pied de page
// =====================================================================
// Supporte :
// - Mises en page colonnes ou minimal-row
// - Réseaux sociaux & liens légaux
// - Mention de souveraineté Qoefi
// =====================================================================

import React from 'react';
import Link from 'next/link';
import type { SocialLink } from '@qoe/sdk/types';
import { getLegalDocumentUrl } from '@qoe/config';
import { COOKIE_POLICY_SLUG } from '@qoe/utils/cookie-consent';
import { SocialIcon } from '../../SocialIcon';
import type {
  FooterBlockProps,
  TemplatePublicationContext,
  TemplateRenderContext,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';
import { EditableText } from './EditableText';
import { NodeRenderer } from './NodeRenderer';

interface FooterBlockComponentProps {
  id: string;
  props: FooterBlockProps;
  publication: TemplatePublicationContext;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
  slots?: Record<string, import('../schema').TemplateNode[]>;
  nodes?: import('../schema').TemplateNode[];
  hiddenAt?: ('mobile' | 'tablet')[];
}

export function FooterBlock({
  id,
  props,
  publication,
  context,
  visible = true,
  locked = false,
  slots,
  nodes,
  hiddenAt,
}: FooterBlockComponentProps) {
  const {
    showLegalLinks = true,
    showSocialLinks = true,
    customCopyright,
    layout = 'columns',
  } = props;

  const { name, domain, socialLinks = [], footerText } = publication;
  const displayName = name || domain || 'Mon Site Web';
  const year = new Date().getFullYear();
  // Les documents légaux sont ceux de la plateforme : ils vivent uniquement
  // sur la vitrine publique (hi.qoe.fi), jamais sur le sous-domaine de la
  // publication ni dans une copie locale.
  const legalDocumentUrl = (slug: string) => getLegalDocumentUrl(slug, domain ?? '');

  return (
    <BlockWrapper
      id={id}
      type="footer"
      label="Pied de Page"
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
      <footer className="w-full border-t border-border bg-card/40 transition-colors">
        <div className="container mx-auto px-4 lg:px-8 py-10 md:py-14">
          <div
            className={`flex flex-col ${
              layout === 'columns'
                ? 'md:flex-row md:items-start md:justify-between gap-8'
                : 'items-center text-center gap-6'
            }`}
          >
            {/* Identité */}
            <div className="max-w-sm">
              <span className="text-lg font-bold tracking-tight text-foreground">
                {displayName}
              </span>
              {footerText && (
                <p className="mt-2 text-xs md:text-sm text-muted-foreground leading-relaxed">
                  {footerText}
                </p>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                © {year} {displayName}.{' '}
                <EditableText
                  blockId={id}
                  propKey="customCopyright"
                  value={customCopyright || 'Tous droits réservés.'}
                  context={context}
                  as="span"
                />
              </p>
            </div>

            {/* Réseaux et Navigation Légale */}
            <div className="flex flex-col gap-4">
              {showSocialLinks && socialLinks.length > 0 && (
                <div className="flex items-center gap-2">
                  {socialLinks.map((social: SocialLink) => (
                    <Link
                      key={social.id}
                      href={social.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <SocialIcon platform={social.platform} className="w-4 h-4" />
                    </Link>
                  ))}
                </div>
              )}

              {showLegalLinks && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  {slots?.legal ? (
                    <NodeRenderer
                      nodes={slots.legal}
                      blockId={id}
                      blockProps={props as unknown as Record<string, unknown>}
                      context={context}
                      path="slots/legal"
                    />
                  ) : (
                    <>
                      <a
                        href={legalDocumentUrl('mentions-legales')}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="hover:text-foreground transition-colors"
                      >
                        Mentions légales
                      </a>
                      <a
                        href={legalDocumentUrl('politique-confidentialite')}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="hover:text-foreground transition-colors"
                      >
                        Confidentialité
                      </a>
                      <a
                        href={legalDocumentUrl(COOKIE_POLICY_SLUG)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="hover:text-foreground transition-colors"
                      >
                        Cookies
                      </a>
                      <Link
                        href="/about"
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="hover:text-foreground transition-colors"
                      >
                        À propos
                      </Link>
                      <Link
                        href="/team"
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="hover:text-foreground transition-colors"
                      >
                        Équipe
                      </Link>
                      <Link
                        href="/sitemap"
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="hover:text-foreground transition-colors"
                      >
                        Plan du site
                      </Link>
                      <Link
                        href="/rss.xml"
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="hover:text-foreground transition-colors"
                      >
                        RSS
                      </Link>
                    </>
                  )}
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
        </div>
      </footer>
    </BlockWrapper>
  );
}
