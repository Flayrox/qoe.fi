import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TenantHeader } from '@qoe/ui';
import { buildCreatorVars } from '@qoe/theme';
import type { TenantPublication } from '@/lib/tenant-data';
import { LegalFooterLinks } from './legal/LegalFooterLinks';

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
    layoutStyle,
    logoUrl,
    navigation,
    socialLinks,
    stripeAccountId,
    supportUrl,
    footerText,
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

  const customStyle = {
    '--tenant-accent': accentColor || 'hsl(var(--primary))',
    fontFamily: fontFamily ? `var(--font-${fontFamily})` : 'inherit',
    ...(themeMode === 'dark' && { colorScheme: 'dark' }),
    ...creatorThemeVars,
  } as React.CSSProperties;

  return (
    <div
      className={`min-h-screen ${themeMode === 'dark' ? 'dark bg-foreground text-background' : 'bg-background text-foreground'} selection:bg-[var(--tenant-accent)] selection:text-white transition-colors duration-300`}
      style={customStyle}
    >
      <TenantHeader
        name={name}
        domain={domain}
        logoUrl={logoUrl}
        avatarUrl={publication.user?.logoUrl ?? null}
        username={publication.user?.username ?? publication.subdomain ?? null}
        layoutStyle={layoutStyle}
        stripeAccountId={stripeAccountId}
        supportUrl={supportUrl}
        navigation={navigation}
        categories={publication.categories}
        siteOptions={
          publication.siteOptions ||
          (publication as unknown as { site_options?: Record<string, unknown> }).site_options
        }
        socialLinks={socialLinks}
      />

      <main className="container mx-auto max-w-4xl px-4 py-12 lg:px-8 lg:py-16">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel || `Retour à ${name || domain}`}
        </Link>
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="container mx-auto max-w-4xl px-4 py-10 lg:px-8">
          {footerText && <p className="mb-6 text-sm text-muted-foreground">{footerText}</p>}
          <LegalFooterLinks />
        </div>
      </footer>
    </div>
  );
}
