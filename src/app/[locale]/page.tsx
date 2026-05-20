import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { Marquee } from "@/components/sections/Marquee";
import { BentoFeatures } from "@/components/sections/BentoFeatures";
import { ProductPreview } from "@/components/sections/ProductPreview";
import { CTA } from "@/components/sections/CTA";
import { DiscoveryFeed } from "@/components/sections/DiscoveryFeed";
import { notFound } from "next/navigation";
import { ALL_LANGUAGES } from "@/tolgee/locales";
import { prisma } from "@/lib/db";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: PageProps) {
  const { locale } = await params;

  if (!ALL_LANGUAGES.includes(locale as any)) {
    notFound();
  }

  // Fetch articles for standard feed (excluding shadowbanned authors)
  const standardArticles = await prisma.article.findMany({
    where: {
      published: true,
      author: { allowIndexing: true, isShadowbanned: false }
    },
    include: {
      author: { select: { name: true, subdomain: true, customDomain: true, logoUrl: true, isCertified: true } },
      category: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 9,
  });

  // Serendipity Articles (Mocking the pgvector logic for MVP by taking random or specific highly-completed articles)
  // In production, this would use a raw SQL pgvector query
  const serendipityArticles = await prisma.article.findMany({
    where: {
      published: true,
      author: { allowIndexing: true, isShadowbanned: false }
    },
    include: {
      author: { select: { name: true, subdomain: true, customDomain: true, logoUrl: true, isCertified: true } },
      category: { select: { name: true } }
    },
    orderBy: { completionRate: 'desc' }, // Recommend highly finished articles
    take: 9,
  });

  return (
    <main className="min-h-screen selection:bg-accent selection:text-white">
      <Navbar />
      <Hero />
      <Marquee />
      <DiscoveryFeed articles={standardArticles} serendiptyArticles={serendipityArticles} />
      <BentoFeatures />
      <ProductPreview />
      <CTA />
      <Footer />
    </main>
  );
}
