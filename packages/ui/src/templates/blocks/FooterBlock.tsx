// =====================================================================
// ⚓ FooterBlock.tsx — Pied de Page & Liens Légaux (Licorne 2026)
// =====================================================================
// Supporte :
// - Mises en page colonnes ou minimal-row
// - Réseaux sociaux & liens légaux
// - Mention de souveraineté Qoefi
// =====================================================================

import React from 'react';
import Link from 'next/link';
import type { SocialLink } from '@qoe/sdk/types';
import { SocialIcon } from '../../SocialIcon';
import type {
  FooterBlockProps,
  TemplatePublicationContext,
  TemplateRenderContext,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';

interface FooterBlockComponentProps {
  id: string;
  props: FooterBlockProps;
  publication: TemplatePublicationContext;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
}

export function FooterBlock({
  id,
  props,
  publication,
  context,
  visible = true,
  locked = false,
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

  return (
    <BlockWrapper
      id={id}
      type="footer"
      label="Pied de Page"
      visible={visible}
      locked={locked}
      context={context}
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
                © {year} {displayName}. {customCopyright || 'Tous droits réservés.'}
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
                  <Link
                    href="/mentions-legales"
                    onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                    className="hover:text-foreground transition-colors"
                  >
                    Mentions légales
                  </Link>
                  <Link
                    href="/confidentialite"
                    onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                    className="hover:text-foreground transition-colors"
                  >
                    Confidentialité
                  </Link>
                  <Link
                    href="/rss"
                    onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                    className="hover:text-foreground transition-colors"
                  >
                    Flux RSS
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </footer>
    </BlockWrapper>
  );
}
