import React from 'react';
import Link from 'next/link';
import { t } from '@lingui/core/macro';
import { getLanguage } from '@qoe/i18n/server';
import { URLS } from '@qoe/config';
import { cn } from '@qoe/utils';

interface FooterLink {
  label: string;
  href: string;
  isExternal?: boolean;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

interface FooterProps {
  config?: Record<string, string>;
  locale?: string;
}

const getDefaultSections = (locale: string): FooterSection[] => {
  const isEn = locale === 'en';

  if (isEn) {
    return [
      {
        title: 'Platform',
        links: [
          { label: 'Reader Experience (/home)', href: `${URLS.APP}/home` },
          { label: 'Creator Studio', href: URLS.STUDIO },
          { label: 'Help Center & Support', href: '/support' },
          { label: 'Report Content & Appeals', href: '/support#contacter' },
          { label: 'API Documentation', href: URLS.DOCS, isExternal: true },
        ],
      },
      {
        title: 'Legal & Privacy',
        links: [
          { label: 'Legal Notice', href: '/legal/mentions-legales' },
          { label: 'Terms of Service', href: '/legal/conditions-generales-utilisation' },
          { label: 'Privacy Policy', href: '/legal/politique-confidentialite' },
          { label: 'GDPR & Data Processing', href: '/legal/accord-traitement-donnees' },
          { label: 'Terms of Sale (CGV)', href: '/legal/conditions-generales-de-vente' },
          { label: 'All Legal Documents', href: '/legal' },
        ],
      },
      {
        title: 'Connect & Ecosystem',
        links: [
          { label: 'X (Twitter)', href: 'https://x.com/qoefi', isExternal: true },
          { label: 'LinkedIn', href: 'https://www.linkedin.com/company/qoefi', isExternal: true },
          { label: 'GitHub (Open Source)', href: 'https://github.com/qoefi', isExternal: true },
          { label: 'RSS Feed', href: `${URLS.APP}/home`, isExternal: true },
        ],
      },
    ];
  }

  return [
    {
      title: 'Plateforme',
      links: [
        { label: 'Espace Lecteur (/home)', href: `${URLS.APP}/home` },
        { label: 'Studio Créateur', href: URLS.STUDIO },
        { label: "Centre d'aide & Support", href: '/support' },
        { label: 'Signaler un contenu / Recours', href: '/support#contacter' },
        { label: 'Documentation API', href: URLS.DOCS, isExternal: true },
      ],
    },
    {
      title: 'Légal & Conformité',
      links: [
        { label: 'Mentions légales', href: '/legal/mentions-legales' },
        { label: "Conditions d'utilisation", href: '/legal/conditions-generales-utilisation' },
        { label: 'Politique de confidentialité', href: '/legal/politique-confidentialite' },
        { label: 'Conformité RGPD', href: '/legal/accord-traitement-donnees' },
        { label: 'Conditions de vente (CGV)', href: '/legal/conditions-generales-de-vente' },
        { label: 'Tous les documents légaux', href: '/legal' },
      ],
    },
    {
      title: 'Réseaux & Écosystème',
      links: [
        { label: 'X (Twitter)', href: 'https://x.com/qoefi', isExternal: true },
        { label: 'LinkedIn', href: 'https://www.linkedin.com/company/qoefi', isExternal: true },
        { label: 'GitHub (Open Source)', href: 'https://github.com/qoefi', isExternal: true },
        { label: 'Flux RSS', href: `${URLS.APP}/home`, isExternal: true },
      ],
    },
  ];
};

export const Footer = async ({ config, locale }: FooterProps) => {
  // Resolve locale if not passed
  const resolvedLocale = locale || (await getLanguage());

  // Get copyright from config or use default
  const copyrightText =
    config?.['footer_copyright'] ||
    t`© ${new Date().getFullYear()} QOEFI. Conçu pour les esprits curieux de l'économie créative européenne.`;

  // Get sections based on active language
  const customSectionsJson =
    config?.[`footer_sections_${resolvedLocale}`] || config?.['footer_sections'];
  let footerSections = getDefaultSections(resolvedLocale);

  if (customSectionsJson) {
    try {
      const parsed = JSON.parse(customSectionsJson);
      if (Array.isArray(parsed)) {
        footerSections = parsed;
      }
    } catch (e) {
      console.error('Failed to parse footer sections JSON:', e);
      // Fallback to default sections is already set
    }
  }

  return (
    <footer className="mt-20 border-t border-border/30 bg-muted/30 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 text-foreground dark:text-muted-foreground">
        {/* Brand, Status & Description */}
        <div className="flex flex-col gap-5">
          <Link
            href="/"
            className="font-display text-2xl font-medium tracking-tight text-foreground dark:text-muted-foreground w-fit"
          >
            QOEFI
          </Link>
          <p className="font-body text-xs text-muted-foreground leading-relaxed max-w-[260px] whitespace-pre-wrap">
            {copyrightText}
          </p>

          {/* Live system status indicator */}
          <a
            href="https://status.qoe.fi"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-success/10 border border-success/20 text-[11px] font-medium text-success w-fit hover:bg-success/15 transition-colors"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            {resolvedLocale === 'en'
              ? 'All systems operational'
              : 'Tous les systèmes opérationnels'}
          </a>
        </div>

        {/* Dynamic Link columns */}
        {footerSections.map((section, idx) => (
          <div key={idx} className="flex flex-col gap-4">
            <h4 className="font-sans text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">
              {section.title}
            </h4>
            {section.links?.map((link, linkIdx) => {
              const isExt = link.isExternal || link.href?.startsWith('http');
              return (
                <Link
                  key={linkIdx}
                  href={link.href || '#'}
                  target={isExt ? '_blank' : undefined}
                  rel={isExt ? 'noopener noreferrer' : undefined}
                  className="font-body text-sm text-muted-foreground hover:text-[#EE4B2B] transition-colors duration-200"
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Sub-footer bar */}
      <div className="max-w-5xl mx-auto px-6 pb-12 pt-8 mt-4 border-t border-border/20 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span>
            🇪🇺{' '}
            {resolvedLocale === 'en'
              ? 'Sovereign European Cloud (Hetzner, Germany)'
              : 'Hébergement souverain européen (Hetzner Allemagne)'}
          </span>
          <span>·</span>
          <span>
            🔒 {resolvedLocale === 'en' ? 'Zero ad tracking' : 'Zéro pistage publicitaire'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link
            href="?lang=fr"
            className={cn(
              'transition-colors hover:text-foreground',
              resolvedLocale === 'fr'
                ? 'font-semibold text-foreground underline underline-offset-4'
                : 'text-muted-foreground'
            )}
          >
            Français
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <Link
            href="?lang=en"
            className={cn(
              'transition-colors hover:text-foreground',
              resolvedLocale === 'en'
                ? 'font-semibold text-foreground underline underline-offset-4'
                : 'text-muted-foreground'
            )}
          >
            English
          </Link>
        </div>
      </div>
    </footer>
  );
};
