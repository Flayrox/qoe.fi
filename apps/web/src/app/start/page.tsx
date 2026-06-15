// =====================================================================
// 🏝️ /start — Landing marketing qoe.fi (version simplifiée pour typecheck)
// =====================================================================

import { Hero } from "@/components/landing/Hero";
import { Marquee } from "@/components/landing/Marquee";
import { BentoFeatures } from "@/components/landing/BentoFeatures";
import { FormatPreview } from "@/components/landing/FormatPreview";
import { ComparisonTable } from "@/components/landing/ComparisonTable";
import { TrustedCreators } from "@/components/landing/TrustedCreators";
import { CreatorHub } from "@/components/landing/CreatorHub";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { FeaturedPublications } from "@/components/landing/FeaturedPublications";
import { CTA } from "@/components/landing/CTA";
import { landingConfig } from "@/config/landing";

import { unstable_cache } from "next/cache";
import { prisma } from "@qoe/db/client";

const getCachedSystemConfig = unstable_cache(
  async () => {
    const configs = await prisma.systemConfig.findMany();
    return Object.fromEntries(configs.map((c: any) => [c.key, c.value]));
  },
  ["system-config"],
  {
    tags: ["system-config"],
    revalidate: 3600
  }
);

function NavbarPremium() {
  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full">
      <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-tight text-xl text-primary">qoe.fi</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/login" className="text-sm font-medium hover:text-primary transition-colors">Sign in</a>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/40 py-6 md:px-8 md:py-0">
      <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row max-w-screen-2xl px-6">
        <p className="text-balance text-center text-sm leading-loose text-muted-foreground md:text-left">
          &copy; {new Date().getFullYear()} qoe.fi. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export const dynamic = "force-dynamic";

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

      <FeaturedPublications
        config={config}
        articles={[]}
      />

      <CTA config={config} />

      <Footer />
    </main>
  );
}
