'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MinimalCraftShell, FooterBlock, type TemplatePublisherContext } from '@qoe/ui/templates';
import { buildCreatorVars, ThemeStyle } from '@qoe/theme';
import type { TenantPublisher } from '@/lib/tenant-data';

interface TenantPageShellProps {
  publisher: TenantPublisher;
  domain: string;
  host?: string;
  backLabel?: string;
  currentPath?: string;
  children: React.ReactNode;
}

export function TenantPageShell({
  publisher,
  domain,
  host,
  backLabel,
  currentPath,
  children,
}: TenantPageShellProps) {
  const { name, accentColor, fontFamily, themeMode, navigation = [], socialLinks = [] } = publisher;

  const siteOpts = (publisher.siteOptions ??
    (publisher as unknown as { site_options?: Record<string, unknown> | null }).site_options ??
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

  const templatePublisher: TemplatePublisherContext = {
    id: publisher.id,
    name: publisher.name,
    slug: publisher.slug,
    domain: host || domain,
    subdomain: publisher.subdomain,
    customDomain: publisher.customDomain,
    logoUrl: publisher.logoUrl,
    heroText: publisher.heroText,
    headerImageUrl: publisher.headerImageUrl,
    footerText: publisher.footerText,
    accentColor: publisher.accentColor || undefined,
    fontFamily: publisher.fontFamily,
    themeMode: (publisher.themeMode as 'light' | 'dark' | 'system') || undefined,
    stripeAccountId: publisher.stripeAccountId,
    supportUrl: publisher.supportUrl,
    categories: publisher.categories,
    siteOptions: siteOpts,
    navigation,
    socialLinks,
    author: publisher.user
      ? {
          name: publisher.user.name ?? null,
          username: publisher.user.username ?? null,
          avatarUrl: publisher.user.logoUrl ?? null,
          bio: publisher.bio ?? null,
          // La carte de survol de l'en-tête lit ce type : sans lui, un média
          // s'y présentait comme une personne (pastille ronde, pas de badge).
          type: publisher.type,
        }
      : undefined,
    team: publisher.team,
  };

  return (
    <>
      <ThemeStyle creator={{ accentColor, backgroundColor, fontFamily, themeMode }} scope=":root" />
      <MinimalCraftShell
        publisher={templatePublisher}
        style={customStyle}
        currentPath={currentPath}
      >
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
          publisher={templatePublisher}
          context={{ mode: 'live' }}
        />
      </MinimalCraftShell>
    </>
  );
}
