import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import { BookOpen, Clock, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { routes } from '@qoe/config/routes';

// ── Contrat de l'historique de lecture (GET /v1/me/reading-history) ─────────
interface HistoryArticle {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  readingTime: number;
  createdAt: string;
  publication?: { name: string; slug?: string | null; subdomain?: string | null } | null;
}
interface HistorySession {
  id: string;
  source: string;
  status: string;
  scrollDepth: number;
  dwellSeconds: number;
  createdAt: string;
  article: HistoryArticle;
}

export default async function ReadingHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <p className="text-muted-foreground">Connectez-vous pour voir votre historique.</p>
      </div>
    );
  }

  const DAYS = 14;
  let unique: HistorySession[];
  try {
    const res = await goFetch<{ sessions: HistorySession[] }>(
      `/v1/me/reading-history?days=${DAYS}`
    );
    // Dédup par articleId, garde le plus récent (déjà fait côté Go — filet ici).
    const seen = new Set<string>();
    unique = res.sessions.filter((s) => {
      if (seen.has(s.article.id)) return false;
      seen.add(s.article.id);
      return true;
    });
  } catch {
    // Fallback Prisma (dev sans QOE_API_URL).
    const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);
    const sessions = await prisma.readingSession.findMany({
      where: { userId: user.id, createdAt: { gte: since } },
      include: {
        article: {
          select: {
            id: true,
            title: true,
            slug: true,
            imageUrl: true,
            readingTime: true,
            createdAt: true,
            publication: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const seen = new Set<string>();
    unique = sessions
      .map((s): HistorySession => ({
        id: s.id,
        source: s.source,
        status: s.status,
        scrollDepth: s.scrollDepth,
        dwellSeconds: s.dwellSeconds,
        createdAt: s.createdAt.toISOString(),
        article: {
          id: s.article.id,
          title: s.article.title,
          slug: s.article.slug,
          imageUrl: s.article.imageUrl,
          readingTime: s.article.readingTime,
          createdAt: s.article.createdAt.toISOString(),
          publication: s.article.publication ? { name: s.article.publication.name } : null,
        },
      }))
      .filter((s) => {
        if (seen.has(s.article.id)) return false;
        seen.add(s.article.id);
        return true;
      });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Clock className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Historique — 14 derniers jours</h1>
        <span className="ml-auto text-sm text-muted-foreground">{unique.length} articles</span>
      </div>

      {unique.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-60" />
          <p>Aucune lecture ces 14 derniers jours.</p>
          <p className="text-sm">Lisez un article pour qu’il apparaisse ici.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {unique.map((s) => (
            <Link
              key={s.id}
              href={routes.feed.article(s.article.slug)}
              className="flex gap-4 p-4 rounded-xl border border-border/60 hover:bg-muted/30 transition-colors"
            >
              {s.article.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.article.imageUrl}
                  alt=""
                  className="w-20 h-14 object-cover rounded-lg shrink-0"
                />
              ) : (
                <div className="w-20 h-14 bg-muted rounded-lg shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-sm line-clamp-1">{s.article.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {s.article.publication?.name} • {s.article.readingTime} min •{' '}
                  {new Date(s.createdAt).toLocaleDateString('fr-FR')}
                </p>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {s.source}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {s.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> {s.scrollDepth}% • {s.dwellSeconds}s
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
