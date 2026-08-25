// =====================================================================
// 📰 Liste des derniers articles — Server Component (clé API côté serveur)
// =====================================================================
import Link from 'next/link';
import { creatorApi, type ArticleSummary, type CreatorMe } from '../lib/qoe';

export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function Home() {
  const [meRes, articlesRes] = await Promise.all([
    creatorApi<CreatorMe>('/v1/creator/me'),
    creatorApi<{ items: ArticleSummary[] }>('/v1/creator/articles?limit=20'),
  ]);

  const name = meRes.ok ? meRes.data.publication.name : 'Mon journal';

  return (
    <div className="wrap">
      <header className="site">
        <h1>{name}</h1>
        <p>
          {articlesRes.ok
            ? `${articlesRes.data.items.length} article(s) publié(s) — propulsé par l'API créateur qoe.fi`
            : "Propulsé par l'API créateur qoe.fi"}
        </p>
      </header>

      <main>
        {!articlesRes.ok && (
          <p>
            Impossible de charger les articles : {articlesRes.error}
            <br />
            Vérifie QOE_API_URL et QOE_API_KEY dans .env
          </p>
        )}

        {articlesRes.ok &&
          articlesRes.data.items.map((article) => (
            <Link key={article.id} href={`/articles/${article.slug}`} className="card" as="article">
              {/* rendu sémantique : le Link englobe la carte */}
              <h2>{article.title}</h2>
              <p className="excerpt">{article.excerpt}</p>
              <div className="meta">
                <span>{formatDate(article.publishedAt)}</span>
                <span>{article.readingTime} min de lecture</span>
                {article.isPremium && <span className="badge">Premium</span>}
                {article.authors.length > 1 && (
                  <span>
                    Par {article.authors.map((a) => a.name ?? a.username ?? a.id).join(', ')}
                  </span>
                )}
              </div>
            </Link>
          ))}
      </main>
    </div>
  );
}
