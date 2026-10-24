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
        title: 'Terms & Policies',
        links: [
          { label: 'Terms of Service', href: '/legal/conditions-generales-utilisation' },
          { label: 'Terms of Sale (CGV)', href: '/legal/conditions-generales-de-vente' },
          { label: 'Creator Agreement', href: '/legal/accord-createur' },
          { label: 'Acceptable Use Policy', href: '/legal/politique-utilisation-acceptable' },
          { label: 'Accessibility Commitment', href: '/legal/engagement-accessibilite' },
        ],
      },
      {
        title: 'Privacy & Legal',
        links: [
          { label: 'Legal Notice', href: '/legal/mentions-legales' },
          { label: 'Privacy Policy', href: '/legal/politique-confidentialite' },
          { label: 'GDPR & Data Processing', href: '/legal/accord-traitement-donnees' },
          { label: 'Cookie Policy', href: '/legal/politique-cookies' },
          { label: 'Sub-processors', href: '/legal/sous-traitants' },
          { label: 'All Legal Documents', href: '/legal' },
        ],
      },
      {
        title: 'Connect',
        links: [
          { label: 'X (Twitter)', href: 'https://x.com/qoefi', isExternal: true },
          { label: 'LinkedIn', href: 'https://www.linkedin.com/company/qoefi', isExternal: true },
          { label: 'GitHub', href: 'https://github.com/qoefi', isExternal: true },
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
      title: 'Conditions & Vente',
      links: [
        { label: "Conditions d'utilisation", href: '/legal/conditions-generales-utilisation' },
        { label: 'Conditions de vente (CGV)', href: '/legal/conditions-generales-de-vente' },
        { label: 'Accord créateur', href: '/legal/accord-createur' },
        { label: 'Utilisation acceptable', href: '/legal/politique-utilisation-acceptable' },
        { label: 'Accessibilité', href: '/legal/engagement-accessibilite' },
      ],
    },
    {
      title: 'Confidentialité & Légal',
      links: [
        { label: 'Mentions légales', href: '/legal/mentions-legales' },
        { label: 'Politique de confidentialité', href: '/legal/politique-confidentialite' },
        { label: 'Conformité RGPD', href: '/legal/accord-traitement-donnees' },
        { label: 'Politique des cookies', href: '/legal/politique-cookies' },
        { label: 'Liste des sous-traitants', href: '/legal/sous-traitants' },
        { label: 'Tous les documents', href: '/legal' },
      ],
    },
    {
      title: 'Réseaux',
      links: [
        { label: 'X (Twitter)', href: 'https://x.com/qoefi', isExternal: true },
        { label: 'LinkedIn', href: 'https://www.linkedin.com/company/qoefi', isExternal: true },
        { label: 'GitHub', href: 'https://github.com/qoefi', isExternal: true },
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
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-10 text-foreground dark:text-muted-foreground">
        {/* Brand */}
        <div className="flex flex-col gap-4 col-span-2 md:col-span-1">
          <Link
            href="/"
            className="font-display text-2xl font-medium tracking-tight text-foreground dark:text-muted-foreground w-fit"
          >
            QOEFI
          </Link>
          <p className="font-body text-xs text-muted-foreground leading-relaxed max-w-[240px] whitespace-pre-wrap">
            {copyrightText}
          </p>
        </div>

        {/* Dynamic Link columns */}
        {footerSections.map((section, idx) => (
          <div key={idx} className="flex flex-col gap-3">
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
      <div className="max-w-6xl mx-auto px-6 pb-12 pt-8 mt-4 border-t border-border/20 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} QOEFI. Tous droits réservés.
        </p>
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
