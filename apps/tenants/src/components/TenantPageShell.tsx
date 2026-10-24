'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MinimalCraftShell, FooterBlock, type TemplatePublicationContext } from '@qoe/ui/templates';
import { buildCreatorVars, ThemeStyle } from '@qoe/theme';
import type { TenantPublication } from '@/lib/tenant-data';

interface TenantPageShellProps {
  publication: TenantPublication;
  domain: string;
  backLabel?: string;
  children: React.ReactNode;
}

export function TenantPageShell({
  publication,
  domain,
  backLabel,
  children,
}: TenantPageShellProps) {
  const {
    name,
    accentColor,
    fontFamily,
    themeMode,
    navigation = [],
    socialLinks = [],
  } = publication;

  const siteOpts = (publication.siteOptions ??
    (publication as unknown as { site_options?: Record<string, unknown> | null }).site_options ??
    {}) as Record<string, unknown>;
  const backgroundColor = (siteOpts.backgroundColor as string) || null;

  const creatorThemeVars = buildCreatorVars({
    accentColor,
    backgroundColor,
    fontFamily,
    themeMode,
  });

  const customStyle: React.CSSProperties = {
    ...creatorThemeVars,
    fontFamily: fontFamily ? `var(--font-${fontFamily})` : 'inherit',
    ['--tenant-accent' as string]: accentColor || 'hsl(var(--primary))',
  };

  const templatePublication: TemplatePublicationContext = {
    id: publication.id,
    name: publication.name,
    slug: publication.slug,
    domain,
    subdomain: publication.subdomain,
    customDomain: publication.customDomain,
    logoUrl: publication.logoUrl,
    heroText: publication.heroText,
    headerImageUrl: publication.headerImageUrl,
    footerText: publication.footerText,
    accentColor: publication.accentColor || undefined,
    fontFamily: publication.fontFamily,
    themeMode: (publication.themeMode as 'light' | 'dark' | 'system') || undefined,
    stripeAccountId: publication.stripeAccountId,
    supportUrl: publication.supportUrl,
    categories: publication.categories,
    siteOptions: siteOpts,
    navigation,
    socialLinks,
    author: publication.user
      ? {
          name: publication.user.name ?? null,
          username: publication.user.username ?? null,
          avatarUrl: publication.user.logoUrl ?? null,
          bio: publication.bio ?? null,
        }
      : undefined,
    team: publication.team,
  };

  return (
    <>
      <ThemeStyle creator={{ accentColor, backgroundColor, fontFamily, themeMode }} scope=":root" />
      <MinimalCraftShell publication={templatePublication} style={customStyle}>
        <div className="container mx-auto max-w-4xl px-4 py-8 lg:px-8">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {backLabel || `Retour à ${name || domain}`}
          </Link>
          {children}
        </div>
        <FooterBlock
          id="tenant-page-footer"
          props={{
            showLegalLinks: true,
            showSocialLinks: true,
            customCopyright: '',
            layout: 'minimal-row',
          }}
          publication={templatePublication}
          context={{ mode: 'live' }}
        />
      </MinimalCraftShell>
    </>
  );
}
