// =====================================================================
// 🏝️ /start — Landing marketing qoe.fi (version simplifiée pour typecheck)
// =====================================================================

import { Hero } from '@/components/landing/Hero';
import { Marquee } from '@/components/landing/Marquee';
import { BentoFeatures } from '@/components/landing/BentoFeatures';
import { FormatPreview } from '@/components/landing/FormatPreview';
import { ComparisonTable } from '@/components/landing/ComparisonTable';
import { TrustedCreators } from '@/components/landing/TrustedCreators';
import { CreatorHub } from '@/components/landing/CreatorHub';
import { ProductPreview } from '@/components/landing/ProductPreview';
import { FeaturedPublications } from '@/components/landing/FeaturedPublications';
import { CTA } from '@/components/landing/CTA';

import { unstable_cache } from 'next/cache';

// Go-first : GET /v1/home/config (public) — map clé → valeur des SystemConfig.
const getCachedSystemConfig = unstable_cache(
  async () => {
    const res = await fetch(`${process.env.QOE_API_URL}/v1/home/config`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, string>;
    return data ?? {};
  },
  ['system-config'],
  {
    tags: ['system-config'],
    revalidate: 3600,
  }
);

import { NavbarPremium } from '@/components/layout/NavbarPremium';
import { Footer } from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';

export default async function StartLanding() {
  let config: Record<string, string> = {};
  try {
    config = await getCachedSystemConfig();
  } catch {
    config = {};
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavbarPremium />

      <Hero config={config} />

      <Marquee />

      <BentoFeatures config={config} />

      <FormatPreview config={config} />

      <ComparisonTable config={config} />

      <TrustedCreators config={config} />

      <CreatorHub config={config} />

      <ProductPreview config={config} />

      <FeaturedPublications config={config} articles={[]} />

      <CTA config={config} />

      <Footer />
    </main>
  );
}
