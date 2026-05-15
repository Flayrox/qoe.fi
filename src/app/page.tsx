import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { Marquee } from "@/components/sections/Marquee";
import { BentoFeatures } from "@/components/sections/BentoFeatures";
import { ProductPreview } from "@/components/sections/ProductPreview";
import { CTA } from "@/components/sections/CTA";

export default function Home() {
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
