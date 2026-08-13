// =====================================================================
// 🌐 PublicFeedPreview — apps/console/src/components/feed/
// =====================================================================
// 📖 Affiché sur qoe.fi/ pour les visiteurs NON connectés.
//    Affiche des posts/articles trending + CTAs d'inscription.
//
// 🎯 DESIGN :
//    ┌────────────────────────────────────────────┐
//    │ Topbar : Logo | "Qu'est-ce que qoe.fi ?" | Se connecter │
//    ├────────────────────────────────────────────┤
//    │ Sidebar G │ Feed central │ Sidebar D    │
//    │           │              │              │
//    │ Trending  │ [Posts et    │ "Pourquoi    │
//    │ tags      │  articles    │  s'inscrire?"│
//    │           │  trending]   │              │
//    │ Créateurs │ [CTAs signup]│ Newsletter   │
//    │ suggérés  │              │              │
//    └────────────────────────────────────────────┘
// =====================================================================

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, TrendingUp } from 'lucide-react';
import { ArticleCard, ThoughtCard, LoginModal } from '@qoe/ui';
import { Button } from '@qoe/ui/button';
import { Logo } from '@qoe/ui/ui/Logo';
import { isFeatureEnabled } from '@qoe/config/features';
import { EVENTS } from '@qoe/analytics/events';
import { URLS } from '@qoe/config';

interface Author {
  id: string;
  name: string | null;
  username: string | null;
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified?: boolean;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl?: string | null;
  published: boolean;
  isPremium: boolean;
  readingTime: number;
  createdAt: Date | string;
  author: Author;
  category: { name: string } | null;
  tags?: string[];
}

interface Post {
  id: string;
  content: string;
  imageUrl?: string | null;
  author: Author;
  createdAt: Date | string;
  tags?: string[];
  _count?: { likes: number; replies: number; reposts: number };
}

interface PublicFeedPreviewProps {
  trendingArticles: Article[];
  trendingPosts: Post[];
}

/**
 * 🌐 Feed preview pour visiteurs anonymes.
 */
export function PublicFeedPreview({ trendingArticles, trendingPosts }: PublicFeedPreviewProps) {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');

  const openAuth = (mode: 'login' | 'signup') => {
    setAuthModalMode(mode);
    setIsLoginModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Topbar minimaliste ─────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="text-lg font-semibold">qoe.fi</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href={URLS.LANDING}
              className="hidden text-sm text-muted-foreground hover:text-foreground md:inline-block"
            >
              Découvrir
            </Link>
            <Button variant="ghost" size="sm" onClick={() => openAuth('login')}>
              Se connecter
            </Button>
            <Button size="sm" onClick={() => openAuth('signup')}>
              S'inscrire
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Layout 3 colonnes ─────────────────────────────── */}
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_2fr_1fr]">
        {/* ─── SIDEBAR G (trending) ─────────────────────── */}
        <aside className="hidden space-y-6 lg:block">
          <div className="rounded-2xl border border-border/40 bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Trending
              </h3>
            </div>
            <div className="space-y-2">
              {[
                '#Investigation',
                '#Souveraineté',
                '#DesignÉthique',
                '#TempsLong',
                '#Émancipation',
              ].map((tag) => (
                <div
                  key={tag}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm hover:bg-muted"
                >
                  {tag}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/40 bg-card p-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Créateurs
            </h3>
            <p className="text-sm text-muted-foreground">Les voix les plus suivies ce mois-ci.</p>
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link href={URLS.LANDING}>Explorer</Link>
            </Button>
          </div>
        </aside>

        {/* ─── FEED CENTRAL ─────────────────────────────── */}
        <main className="space-y-6">
          {/* Banner CTA */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/70 p-8 text-white shadow-xl">
            <div className="relative z-10">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                <span className="text-sm font-semibold uppercase tracking-wider opacity-90">
                  Tu lis en aperçu
                </span>
              </div>
              <h2 className="mb-3 text-2xl font-bold leading-tight md:text-3xl">
                Rejoins les voix qui pensent en dehors de l'algorithme.
              </h2>
              <p className="mb-6 max-w-md text-white/90">
                Crée un compte gratuit pour suivre tes créateurs, sauvegarder des articles, et
                participer à la conversation.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => openAuth('signup')}
                  data-event={EVENTS.SIGNUP_STARTED}
                >
                  Créer un compte gratuit
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="text-white hover:bg-white/10"
                  onClick={() => openAuth('login')}
                >
                  Se connecter
                </Button>
              </div>
            </div>
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5 blur-3xl" />
          </div>

          {/* Mix Posts + Articles trending */}
          {isFeatureEnabled('THOUGHTS_ENABLED') && trendingPosts.length > 0 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 px-2 text-lg font-semibold">
                🔥 Trending aujourd'hui
              </h2>
              <div className="space-y-4">
                {trendingPosts.slice(0, 3).map((post) => (
                  <ThoughtCard
                    key={post.id}
                    post={{
                      id: post.id,
                      content: post.content,
                      imageUrl: post.imageUrl ?? null,
                      createdAt:
                        typeof post.createdAt === 'string'
                          ? post.createdAt
                          : post.createdAt.toISOString(),
                      author: {
                        ...post.author,
                        isCertified: post.author.isCertified || false,
                      },
                      tags: post.tags || [],
                      _count: post._count,
                    }}
                    isPreview
                  />
                ))}
              </div>
            </section>
          )}

          {trendingArticles.length > 0 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 px-2 text-lg font-semibold">
                📚 Articles populaires
              </h2>
              <div className="space-y-4">
                {trendingArticles.slice(0, 3).map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={{
                      ...article,
                      createdAt:
                        typeof article.createdAt === 'string'
                          ? article.createdAt
                          : article.createdAt.toISOString(),
                      author: {
                        ...article.author,
                        isCertified: article.author.isCertified || false,
                      },
                      tags: article.tags || [],
                    }}
                    isPreview
                  />
                ))}
              </div>
            </section>
          )}

          {/* CTA final */}
          <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-8 text-center">
            <h3 className="mb-2 text-xl font-bold">Tu veux voir la suite ?</h3>
            <p className="mb-6 text-muted-foreground">
              Inscris-toi gratuitement, pas de carte bancaire requise.
            </p>
            <Button size="lg" onClick={() => openAuth('signup')}>
              Créer mon compte
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </main>

        {/* ─── SIDEBAR D (CTA) ─────────────────────────── */}
        <aside className="hidden space-y-6 lg:block">
          <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-6">
            <h3 className="mb-2 text-lg font-bold">Pourquoi s'inscrire ?</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>Feed personnalisé selon tes abonnements</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>Sauvegarde et surligne tes lectures</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>Soutiens directement les créateurs</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>Pas de pub, pas de tracking</span>
              </li>
            </ul>
            <Button className="mt-6 w-full" onClick={() => openAuth('signup')}>
              S'inscrire gratuitement
            </Button>
          </div>

          <div className="rounded-2xl border border-border/40 p-6">
            <h3 className="mb-2 text-sm font-semibold">Newsletter hebdo</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Les meilleurs articles du vendredi dans ta boîte mail.
            </p>
            <input
              type="email"
              placeholder="ton@email.com"
              className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm"
            />
            <Button variant="outline" size="sm" className="mt-2 w-full">
              S'abonner
            </Button>
          </div>
        </aside>
      </div>
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        initialMode={authModalMode}
      />
    </div>
  );
}
