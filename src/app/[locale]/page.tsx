import { NavbarPremium } from "@/components/layout/NavbarPremium";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { FeaturedPublications } from "@/components/sections/FeaturedPublications";
import { CTA } from "@/components/sections/CTA";
import { CreatorHub } from "@/components/sections/CreatorHub";
import { notFound } from "next/navigation";
import { ALL_LANGUAGES } from "@/tolgee/locales";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { ProfileDashboard } from "./ProfileDashboard";
import { AppSidebar } from "@/components/layout/AppSidebar";

import { getCachedStandardArticles, getCachedSystemConfig } from "@/lib/cached-queries";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: PageProps) {
  const { locale } = await params;
  const decodedLocale = decodeURIComponent(locale);

  // 1. Intercept Profile routes (starting with '@')
  if (decodedLocale.startsWith("@")) {
    const cleanUsername = decodedLocale.substring(1);

    // Fetch user profile
    const profileUser = await prisma.user.findUnique({
      where: { username: cleanUsername },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        logoUrl: true,
        heroText: true,
        onboardingText: true,
        isCertified: true,
        createdAt: true,
        subdomain: true,
        headerImageUrl: true
      }
    });

    if (!profileUser) {
      notFound();
    }

    // Fetch authenticated user details (for actions authorization)
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const currentUserId = authUser?.id || null;

    // Check if current user is following this profile
    let isFollowing = false;
    if (currentUserId && currentUserId !== profileUser.id) {
      const followRecord = await prisma.follows.findUnique({
        where: {
          readerId_creatorId: {
            readerId: currentUserId,
            creatorId: profileUser.id
          }
        }
      });
      isFollowing = !!followRecord;
    }

    // Fetch statistics
    const followersCount = await prisma.follows.count({ where: { creatorId: profileUser.id } });
    const followingCount = await prisma.follows.count({ where: { readerId: profileUser.id } });
    const postsCount = await prisma.post.count({ where: { authorId: profileUser.id } });

    // Fetch micro-posts (thoughts)
    const dbPosts = await prisma.post.findMany({
      where: { authorId: profileUser.id },
      include: {
        author: {
          select: { id: true, name: true, username: true, logoUrl: true, isCertified: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch articles (if creator or superadmin)
    const dbArticles = (profileUser.role === 'creator' || profileUser.role === 'superadmin')
      ? await prisma.article.findMany({
          where: { authorId: profileUser.id, published: true },
          include: {
            category: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' }
        })
      : [];

    // Fetch public highlights
    const dbHighlights = await prisma.highlight.findMany({
      where: { readerId: profileUser.id },
      include: {
        article: {
          select: { title: true, slug: true, author: { select: { name: true } } }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 15
    });

    // Fetch muted words if own profile
    let dbMutedWords: Array<{ id: string, word: string }> = [];
    if (currentUserId && currentUserId === profileUser.id) {
      dbMutedWords = await prisma.mutedWord.findMany({
        where: { userId: currentUserId },
        select: { id: true, word: true },
        orderBy: { createdAt: 'desc' }
      });
    }

    // Fetch public letters received
    const dbLetters = await prisma.letter.findMany({
      where: {
        recipientId: profileUser.id,
        isPublic: true
      },
      include: {
        sender: {
          select: { name: true, username: true, logoUrl: true, isCertified: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Map database dates to ISO strings for client compatibility
    const serializedPosts = dbPosts.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString()
    }));

    const serializedArticles = dbArticles.map(a => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString()
    }));

    const serializedHighlights = dbHighlights.map(h => ({
      ...h,
      createdAt: h.createdAt.toISOString()
    }));

    const serializedLetters = dbLetters.map(l => ({
      ...l,
      createdAt: l.createdAt.toISOString()
    }));

    const linkedProviders = authUser?.identities?.map(id => id.provider) || [];

    // Fetch sidebar user data if logged in
    let sidebarUser = null;
    if (currentUserId) {
      sidebarUser = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          logoUrl: true,
          username: true,
          walletBalanceCents: true
        }
      });
    }

    // If logged in: show sidebar + profile
    // If not logged in: show navbar + profile
    if (currentUserId && sidebarUser) {
      return (
        <div className="min-h-screen bg-[#FAFAFA] text-neutral-800 transition-colors duration-300 font-sans selection:bg-[#EE4B2B]/10 selection:text-[#EE4B2B]">
          <div className="container mx-auto px-4 py-6 max-w-7xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <AppSidebar user={sidebarUser} />
              <main className="lg:col-span-9 min-w-0">
                <ProfileDashboard
                  profileUser={{
                    ...profileUser,
                    createdAt: profileUser.createdAt.toISOString()
                  }}
                  currentUserId={currentUserId}
                  isFollowing={isFollowing}
                  followersCount={followersCount}
                  followingCount={followingCount}
                  postsCount={postsCount}
                  posts={serializedPosts}
                  articles={serializedArticles}
                  highlights={serializedHighlights}
                  letters={serializedLetters}
                  initialMutedWords={dbMutedWords}
                  linkedProviders={linkedProviders}
                />
              </main>
            </div>
          </div>
        </div>
      );
    }

    // Not logged in: public view with navbar
    return (
      <div className="relative min-h-screen bg-neutral-50 transition-colors">
        <NavbarPremium />
        <div className="pt-20">
          <ProfileDashboard
            profileUser={{
              ...profileUser,
              createdAt: profileUser.createdAt.toISOString()
            }}
            currentUserId={currentUserId}
            isFollowing={isFollowing}
            followersCount={followersCount}
            followingCount={followingCount}
            postsCount={postsCount}
            posts={serializedPosts}
            articles={serializedArticles}
            highlights={serializedHighlights}
            letters={serializedLetters}
            initialMutedWords={dbMutedWords}
            linkedProviders={linkedProviders}
          />
        </div>
      </div>
    );
  }

  // 2. Standard Landing Page (Dynamic Localized Router)
  if (!ALL_LANGUAGES.includes(decodedLocale as any)) {
    notFound();
  }

  // Fetch articles for standard feed (excluding shadowbanned authors) using Cache
  const standardArticles = await getCachedStandardArticles();

  // Fetch SystemConfig for landing page content using Cache
  const configMap = await getCachedSystemConfig();

  return (
    <main className="min-h-screen selection:bg-primary selection:text-primary-foreground overflow-x-hidden bg-background text-foreground">
      <NavbarPremium />
      <Hero config={configMap} />
      <FeaturedPublications articles={standardArticles} config={configMap} />
      <CTA config={configMap} />
      <CreatorHub config={configMap} />
      <Footer config={configMap} locale={decodedLocale} />
    </main>
  );
}
