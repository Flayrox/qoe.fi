import { NavbarPremium } from "@/components/layout/NavbarPremium";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { DiscoveryFeed } from "@/components/sections/DiscoveryFeed";
import { FeaturedPublications } from "@/components/sections/FeaturedPublications";
import { CTA } from "@/components/sections/CTA";
import { notFound } from "next/navigation";
import { ALL_LANGUAGES } from "@/tolgee/locales";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: PageProps) {
  const { locale } = await params;

  if (!ALL_LANGUAGES.includes(locale as any)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let mutedWords: string[] = [];
  if (user) {
    const userMutedWords = await prisma.mutedWord.findMany({
      where: { userId: user.id },
      select: { word: true }
    });
    mutedWords = userMutedWords.map(mw => mw.word);
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

  // Fetch SystemConfig for landing page content
  const configs = await prisma.systemConfig.findMany();
  const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]));

  return (
    <main className="min-h-screen selection:bg-primary selection:text-primary-foreground overflow-x-hidden bg-background text-foreground">
      <NavbarPremium />
      <Hero config={configMap} />
      <FeaturedPublications articles={standardArticles} config={configMap} />
      <DiscoveryFeed 
        articles={standardArticles} 
        mutedWords={mutedWords}
      />
      <CTA config={configMap} />
      <Footer />
    </main>
  );
}
