'use client';

// =====================================================================
// 🔍 SeoPreview — aperçu d'un résultat Google et d'une carte de partage
// =====================================================================
// Deux rendus, pas de badges ni de scores : ce que verront les lecteurs.
// =====================================================================

import React, { useState } from 'react';
import Image from 'next/image';
import { Globe } from 'lucide-react';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import { StudioSection } from '@/components/studio-page';

interface SeoPreviewProps {
  name: string | null;
  subdomain: string | null;
  customDomain: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  heroText?: string | null;
  headerImageUrl: string | null;
  logoUrl: string | null;
  allowIndexing: boolean;
}

type PreviewView = 'search' | 'share';

export function SeoPreview({
  name,
  subdomain,
  customDomain,
  seoTitle,
  seoDescription,
  heroText,
  headerImageUrl,
  logoUrl,
  allowIndexing,
}: SeoPreviewProps) {
  const [view, setView] = useState<PreviewView>('search');

  const domain = customDomain || `${subdomain || 'publisher'}.qoe.fi`;

  // Sans surcharge, l'aperçu montre ce que le site génère déjà : le nom et
  // le slogan. C'est exactement ce que le visiteur verra tant que les champs
  // restent vides.
  const title =
    seoTitle?.trim() ||
    `${name || 'Ma publication'}${heroText?.trim() ? ` — ${heroText.trim()}` : ''}`;
  const description =
    seoDescription?.trim() ||
    heroText?.trim() ||
    `Publishers, analyses et articles de ${name || 'cette publication'}.`;

  return (
    <StudioSection title="Aperçu">
      <Tabs
        variant="segmented"
        size="sm"
        value={view}
        onValueChange={(value) => setView(value as PreviewView)}
        className="mb-4"
      >
        <TabList aria-label="Type d'aperçu">
          <Tab id="search">Résultat Google</Tab>
          <Tab id="share">Carte de partage</Tab>
        </TabList>
      </Tabs>

      {view === 'search' ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted text-[10px] font-semibold text-foreground">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt=""
                  width={20}
                  height={20}
                  className="size-5 object-cover"
                />
              ) : (
                (name || 'Q').charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <span className="block truncate text-xs font-medium leading-tight text-foreground">
                {name || 'Publisher'}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{domain}</span>
            </div>
          </div>

          <h3 className="text-base leading-snug font-medium text-primary">{title}</h3>
          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/50">
          <div className="relative h-40 w-full overflow-hidden bg-muted/40">
            {headerImageUrl ? (
              <Image
                src={headerImageUrl}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 420px"
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
                <Globe className="size-6 text-muted-foreground/50" />
                <span className="text-xs font-medium text-foreground">{name || 'Publisher'}</span>
              </div>
            )}
          </div>
          <div className="space-y-1 p-3">
            <span className="block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {domain}
            </span>
            <h3 className="line-clamp-1 text-xs font-semibold text-foreground">{title}</h3>
            <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      )}

      {!allowIndexing ? (
        <p className="mt-4 border-t border-border/40 pt-3 text-[11px] leading-relaxed text-muted-foreground">
          L&apos;indexation est désactivée : le site n&apos;apparaîtra pas dans les résultats de
          recherche, mais cet aperçu reste celui d&apos;une page partagée.
        </p>
      ) : null}
    </StudioSection>
  );
}
