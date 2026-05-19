import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { Marquee } from "@/components/sections/Marquee";
import { BentoFeatures } from "@/components/sections/BentoFeatures";
import { ProductPreview } from "@/components/sections/ProductPreview";
import { CTA } from "@/components/sections/CTA";
import { notFound } from "next/navigation";
import { ALL_LANGUAGES } from "@/tolgee/locales";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: PageProps) {
  const { locale } = await params;

  if (!ALL_LANGUAGES.includes(locale as any)) {
    notFound();
  }

  return (
    <main className="min-h-screen selection:bg-accent selection:text-white">
      <Navbar />
      
      {/* Sections */}
      <Hero />
      <Marquee />
      <BentoFeatures />
      <ProductPreview />
      <CTA />
      
      <Footer />
    </main>
  );
}
