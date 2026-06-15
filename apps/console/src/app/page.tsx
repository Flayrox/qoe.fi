// =====================================================================
// 🏠 Home — apps/console/src/app/page.tsx
// =====================================================================
// Composant racine de qoe.fi (servi sur qoe.fi/)
// - Anonyme → PublicFeedPreview (trending + CTA)
// - Connecté → FeedDashboard personnel
// =====================================================================

import { getCurrentUser } from "@qoe/auth/current-user";
import { findTrending as findTrendingArticles } from "@qoe/db/repositories/articles";
import { findTrending as findTrendingPosts } from "@qoe/db/repositories/posts";
import { PublicFeedPreview } from "@/components/feed/PublicFeedPreview";
import { ArticleCard } from "@/components/feed/ArticleCard";
import { MicroPostCard } from "@/components/feed/MicroPostCard";
import { isFeatureEnabled } from "@qoe/config/features";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();

  // 👤 Anonyme : PublicFeedPreview
  if (!user) {
    const [trendingArticles, trendingPosts] = await Promise.all([
      findTrendingArticles(6),
      findTrendingPosts(6),
    ]);

    return (
      <PublicFeedPreview
        trendingArticles={trendingArticles as any}
        trendingPosts={trendingPosts as any}
      />
    );
  }

  // 👤 Connecté : FeedDashboard personnel
  // Le vrai FeedDashboard viendra d'une migration future.
  // Pour l'instant, on affiche un placeholder + un feed trending simple.
  return (
    <AuthenticatedHome userId={user.id} />
  );
}

async function AuthenticatedHome({ userId }: { userId: string }) {
  // TODO Phase 8.5 finale : recréer le vrai FeedDashboard
  const [trendingArticles, trendingPosts] = await Promise.all([
    findTrendingArticles(10),
    findTrendingPosts(10),
  ]);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/40 p-4">
        <h1 className="text-xl font-bold">Mon fil</h1>
      </header>
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {isFeatureEnabled("MICROPOSTS_ENABLED") &&
          trendingPosts.map((post: any) => (
            <MicroPostCard key={post.id} post={post} isPreview={false} />
          ))}
        {trendingArticles.map((article: any) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </main>
  );
}
