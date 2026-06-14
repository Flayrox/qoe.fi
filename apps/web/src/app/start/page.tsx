// =====================================================================
// 🏝️ /start — Landing marketing qoe.fi
// =====================================================================
// 📖 Cette page est servie sur start.qoe.fi (sous-domaine marketing).
//    Elle présente le produit aux visiteurs AVANT qu'ils s'inscrivent.
//
// 🎯 Sections (dans l'ordre) :
//    1. Navbar
//    2. Hero (phrase d'accroche + CTA)
//    3. Marquee (mots-clés qui scrollent)
//    4. BentoFeatures (4 features principales)
//    5. FormatPreview (exemple de format d'article)
//    6. ComparisonTable (vs autres plateformes)
//    7. TrustedCreators (témoignages)
//    8. CreatorHub (pour les créateurs)
//    9. ProductPreview (aperçu produit)
//    10. FeaturedPublications (articles en vedette)
//    11. CTA final (inscription)
//    12. Footer
//
// 📖 Note : c'est un Server Component qui rend des Client Components.
//    Les sections "use client" sont auto-importées par Next.js.
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
import { NavbarPremium } from "@/components/layout/NavbarPremium";
import { Footer } from "@/components/layout/Footer";
import { getCachedSystemConfig } from "@qoe/db/repositories/users";

// TODO: Quand les layouts seront migrés, créer apps/web/src/app/layout.tsx
// avec ThemeProvider + TolgeeNextProvider (déplacé depuis src/app/layout.tsx)
import "../../../../src/app/globals.css";

export const dynamic = "force-dynamic"; // À optimiser avec ISR plus tard

export default async function StartLanding() {
  // Charge la config CMS (hero copy, features, etc.) depuis la DB
  // Permet à l'admin de modifier le contenu de la landing sans redéployer
  const config = (await getCachedSystemConfig()) as Record<string, string>;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavbarPremium />

      <Hero config={config} />

      <Marquee />

      <BentoFeatures config={config} />

      <FormatPreview />

      <ComparisonTable />

      <TrustedCreators />

      <CreatorHub />

      <ProductPreview config={landingConfig.productPreview} />

      <FeaturedPublications
        config={config}
        // TODO Phase 2.5 : charger les articles réels depuis @qoe/db
        articles={[]}
      />

      <CTA config={config} />

      <Footer />
    </main>
  );
}
