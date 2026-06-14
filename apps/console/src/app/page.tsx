// =====================================================================
// 🏠 Home — apps/console/src/app/page.tsx
// =====================================================================
// 📖 Page d'accueil de qoe.fi (servie sur qoe.fi/)
//
// 🎯 COMPORTEMENT DYNAMIQUE :
//    - Anonyme  → "PublicFeedPreview" (trending + CTA signup)
//    - Connecté → Feed personnalisé (FeedDashboard existant)
//
// 📖 Style Substack/Twitter : la home EST l'app, pas une landing froide.
//    L'utilisateur voit la valeur immédiatement, on lui demande de
//    s'inscrire plus tard dans le parcours.
// =====================================================================

import { redirect } from "next/navigation";
import { getCurrentUser } from "@qoe/auth/current-user";
import { findTrending } from "@qoe/db/repositories/articles";
import { findTrending as findTrendingPosts } from "@qoe/db/repositories/posts";
import { PublicFeedPreview } from "@/components/feed/PublicFeedPreview";
import { FeedDashboard } from "@/components/feed/FeedDashboard";

export const dynamic = "force-dynamic"; // Toujours frais (timeline temps réel)

export default async function Home() {
  // 🔐 Récupère l'utilisateur (peut être null)
  const user = await getCurrentUser();

  // 👤 ANONYME : PublicFeedPreview
  if (!user) {
    const [trendingArticles, trendingPosts] = await Promise.all([
      findTrending(6),
      findTrendingPosts(6),
    ]);

    return (
      <PublicFeedPreview
        trendingArticles={trendingArticles}
        trendingPosts={trendingPosts}
      />
    );
  }

  // 👤 CONNECTÉ : Feed personnalisé
  // Pour l'instant, on réutilise le FeedDashboard existant.
  // Phase 3.5 : extraire la logique de fetch dans le composant lui-même.
  return <AuthenticatedHome userId={user.id} />;
}

/**
 * 🏠 Composant pour user connecté.
 * Délègue au FeedDashboard existant (qui sera migré dans apps/console).
 */
async function AuthenticatedHome({ userId }: { userId: string }) {
  // Pour l'instant, on importe dynamiquement le FeedDashboard depuis
  // l'ancien emplacement. Sera migré physiquement en Phase 3.5.
  const { FeedDashboard: ExistingFeedDashboard } = await import(
    "../../../../src/app/(main)/home/FeedDashboard"
  );

  // Réutilise la logique de fetch existante via Server Action
  const { fetchHomeData } = await import(
    "../../../../src/app/(main)/home/actions"
  );
  const data = await fetchHomeData(userId);

  return <ExistingFeedDashboard {...data} />;
}
