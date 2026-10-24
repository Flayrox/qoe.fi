import React from 'react';
import Link from 'next/link';
import { t } from '@lingui/core/macro';
import { getLanguage } from '@qoe/i18n/server';
import { URLS } from '@qoe/config';

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
        title: 'Legal',
        links: [
          { label: 'Legal Notice', href: '/legal/mentions-legales' },
          { label: 'Terms of Service', href: '/legal/conditions-generales-utilisation' },
          { label: 'Privacy Policy', href: '/legal/politique-confidentialite' },
          { label: 'GDPR Compliance', href: '/legal/accord-traitement-donnees' },
          { label: 'Legal Center', href: '/legal' },
        ],
      },
      {
        title: 'Platform',
        links: [
          { label: 'Reader Experience (/home)', href: `${URLS.APP}/home` },
          { label: 'Creator Studio', href: URLS.STUDIO },
          { label: 'Support / Contact us', href: '/support' },
          { label: 'API Documentation', href: URLS.DOCS, isExternal: true },
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
      title: 'Légal',
      links: [
        { label: 'Mentions légales', href: '/legal/mentions-legales' },
        { label: "Conditions d'utilisation", href: '/legal/conditions-generales-utilisation' },
        { label: 'Politique de confidentialité', href: '/legal/politique-confidentialite' },
        { label: 'Conformité RGPD', href: '/legal/accord-traitement-donnees' },
        { label: 'Centre légal', href: '/legal' },
      ],
    },
    {
      title: 'Plateforme',
      links: [
        { label: 'Espace Lecteur (/home)', href: `${URLS.APP}/home` },
        { label: 'Studio Créateur', href: URLS.STUDIO },
        { label: 'Support / Nous contacter', href: '/support' },
        { label: 'Documentation API', href: URLS.DOCS, isExternal: true },
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
      <div className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 text-foreground dark:text-muted-foreground">
        {/* Brand & Copyright */}
        <div className="flex flex-col gap-6">
          <Link
            href="/"
            className="font-display text-2xl font-medium tracking-tight text-foreground dark:text-muted-foreground"
          >
            QOEFI
          </Link>
          <p className="font-body text-xs text-muted-foreground leading-relaxed max-w-[250px] whitespace-pre-wrap">
            {copyrightText}
          </p>
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
    </footer>
  );
};
