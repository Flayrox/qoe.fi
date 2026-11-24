import React from 'react';
import Link from 'next/link';
import { t } from '@lingui/core/macro';
import { getLanguage } from '@qoe/i18n/server';
import { URLS } from '@qoe/config';
import { cn } from '@qoe/utils';
import { isFilledString, isRecord, parseJsonArray } from '@/lib/config-json';

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

// Endonymes : le nom d'une langue s'écrit dans cette langue, jamais traduit.
// C'est la seule copie du footer qui ne passe pas par Lingui (un francophone
// doit retrouver « Français » même quand l'interface est en anglais).
const LANGUAGE_LABELS = { fr: 'Français', en: 'English' } as const;

// Garde de forme : la config vient de la console, en JSON libre.
function isFooterSection(value: unknown): value is FooterSection {
  if (!isRecord(value) || !isFilledString(value.title)) return false;
  if (!Array.isArray(value.links)) return false;
  return value.links.every(
    (link) =>
      isRecord(link) &&
      isFilledString(link.label) &&
      isFilledString(link.href) &&
      (link.isExternal === undefined || typeof link.isExternal === 'boolean')
  );
}

// Colonnes par défaut résolues au rendu : la langue vient du catalogue Lingui
// (activé par le layout), plus d'un couple FR/EN recopié à la main.
const getDefaultSections = (): FooterSection[] => [
  {
    title: t`Plateforme`,
    links: [
      { label: t`Espace Lecteur (/home)`, href: `${URLS.APP}/home` },
      { label: t`Studio Créateur`, href: URLS.STUDIO },
      { label: t`Centre d'aide & Support`, href: '/support' },
      { label: t`Signaler un contenu / Recours`, href: '/support#contacter' },
      { label: t`Documentation API`, href: URLS.DOCS, isExternal: true },
    ],
  },
  {
    title: t`Conditions & Vente`,
    links: [
      { label: t`Conditions d'utilisation`, href: '/legal/terms' },
      { label: t`Conditions de vente (CGV)`, href: '/legal/sales' },
      { label: t`Accord créateur`, href: '/legal/creators' },
      { label: t`Utilisation acceptable`, href: '/legal/acceptable-use' },
      { label: t`Accessibilité`, href: '/legal/accessibility' },
    ],
  },
  {
    title: t`Confidentialité & Légal`,
    links: [
      { label: t`Mentions légales`, href: '/legal/legal-notice' },
      { label: t`Politique de confidentialité`, href: '/legal/privacy' },
      { label: t`Conformité RGPD`, href: '/legal/dpa' },
      { label: t`Politique des cookies`, href: '/legal/cookies' },
      { label: t`Liste des sous-traitants`, href: '/legal/subprocessors' },
      { label: t`Tous les documents`, href: '/legal' },
    ],
  },
  {
    title: t`Réseaux`,
    links: [
      { label: 'X (Twitter)', href: 'https://x.com/qoefi', isExternal: true },
      { label: 'LinkedIn', href: 'https://www.linkedin.com/company/qoefi', isExternal: true },
      { label: 'GitHub', href: 'https://github.com/qoefi', isExternal: true },
    ],
  },
];

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
  let footerSections = getDefaultSections();

  if (customSectionsJson) {
    // Une section sans titre ou un lien sans intitulé n'a rien à faire à
    // l'écran : on ignore l'entrée et on garde les colonnes par défaut.
    const custom = parseJsonArray(customSectionsJson).filter(isFooterSection);
    if (custom.length > 0) footerSections = custom;
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
          © {new Date().getFullYear()} QOEFI. {t`Tous droits réservés.`}
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
            {LANGUAGE_LABELS.fr}
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
            {LANGUAGE_LABELS.en}
          </Link>
        </div>
      </div>
    </footer>
  );
};
