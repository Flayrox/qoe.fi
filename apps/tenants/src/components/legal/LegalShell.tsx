import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Scale } from 'lucide-react';
import { TenantHeader } from '@qoe/ui';
import type { PublicLegalDocument } from '@qoe/sdk/actions/legal';
import type { TenantPublication } from '@/lib/tenant-data';

// =====================================================================
// ⚖️ LegalShell — enveloppe commune des pages légales d'un tenant
// =====================================================================
// Reprend l'identité visuelle de la publication (accent, typo, thème,
// layout) et ajoute une navigation latérale entre les documents. Les
// pages légales doivent paraître « chez le créateur », pas être une
// coquille externe : c'est aussi un critère de conformité (information
// facilement accessible).
// =====================================================================

export const CATEGORY_LABELS: Record<string, string> = {
  legal: 'Mentions & conditions',
  privacy: 'Confidentialité',
  commerce: 'Paiements & ventes',
  creator: 'Espace créateur',
  security: 'Sécurité',
  general: 'Informations',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? 'Informations';
}

interface LegalShellProps {
  publication: TenantPublication;
  domain: string;
  documents: PublicLegalDocument[];
  currentSlug?: string;
  children: React.ReactNode;
}

export function LegalShell({
  publication,
  domain,
  documents,
  currentSlug,
  children,
}: LegalShellProps) {
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
  } = publication;

  const isBrutalist = layoutStyle === 'brutalist';

  const customStyle = {
    '--tenant-accent': accentColor || 'hsl(var(--primary))',
    fontFamily: fontFamily ? `var(--font-${fontFamily})` : 'inherit',
    ...(themeMode === 'dark' && { colorScheme: 'dark' }),
  } as React.CSSProperties;

  const grouped = new Map<string, PublicLegalDocument[]>();
  for (const doc of documents) {
    const list = grouped.get(doc.category) ?? [];
    list.push(doc);
    grouped.set(doc.category, list);
  }

  return (
    <div
      className={`min-h-screen ${themeMode === 'dark' ? 'dark bg-foreground text-background' : 'bg-background text-foreground'} selection:bg-[var(--tenant-accent)] selection:text-white transition-colors duration-300`}
      style={customStyle}
    >
      <TenantHeader
        name={name}
        domain={domain}
        logoUrl={logoUrl}
        layoutStyle={layoutStyle}
        stripeAccountId={stripeAccountId}
        supportUrl={supportUrl}
        navigation={navigation}
        socialLinks={socialLinks}
      />

      <main className="container mx-auto max-w-6xl px-4 py-12 lg:px-8 lg:py-16">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-[var(--tenant-accent)]"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à {name || domain}
        </Link>

        <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="mb-4 flex items-center gap-2 text-[var(--tenant-accent)]">
              <Scale className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-widest">
                Informations légales
              </span>
            </div>

            <nav className={`space-y-5 ${isBrutalist ? 'font-black uppercase' : ''}`}>
              {[...grouped.entries()].map(([category, docs]) => (
                <div key={category}>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {categoryLabel(category)}
                  </p>
                  <ul className="space-y-1.5 border-l border-border pl-3">
                    {docs.map((doc) => {
                      const isCurrent = doc.slug === currentSlug;
                      return (
                        <li key={doc.id}>
                          <Link
                            href={`/legal/${doc.slug}`}
                            className={`block text-sm leading-snug transition-colors ${
                              isCurrent
                                ? 'font-semibold text-[var(--tenant-accent)]'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {doc.title}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {documents.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Aucun document publié pour le moment.
                </p>
              )}
            </nav>
          </aside>

          <article className="min-w-0">{children}</article>
        </div>
      </main>

      <footer
        className={`mt-16 border-t px-4 py-12 text-center ${isBrutalist ? 'border-t-4 border-foreground' : 'bg-muted dark:bg-foreground/5'}`}
      >
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
            {documents.slice(0, 6).map((doc) => (
              <Link
                key={doc.id}
                href={`/legal/${doc.slug}`}
                className="text-muted-foreground transition-colors hover:text-[var(--tenant-accent)]"
              >
                {doc.title}
              </Link>
            ))}
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            &copy; {new Date().getFullYear()} {name}. Propulsé par{' '}
            <Link
              href="https://qoe.fi"
              className="underline transition-colors hover:text-[var(--tenant-accent)]"
            >
              qoe.fi
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

/** 🧾 Rendu du markdown légal, avec ancres et styles typographiques. */
export function LegalBody({ html }: { html: string }) {
  return (
    <div
      className="legal-prose mt-8 space-y-4 text-[15px] leading-relaxed text-foreground/90 [&_a]:text-[var(--tenant-accent)] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--tenant-accent)]/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
