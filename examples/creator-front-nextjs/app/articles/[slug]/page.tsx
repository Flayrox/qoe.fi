// =====================================================================
// 📄 Article complet — contenu HTML prêt à l'emploi + markdown dispo.
// =====================================================================
// Le stockage qoe.fi est en HTML : `contentHtml` se rend directement.
// `contentMarkdown` est fourni pour les fronts qui préfèrent un moteur
// Markdown (react-markdown, remark…) — même contenu, autre format.
import { notFound } from 'next/navigation';
import { creatorApi, type ArticleFull } from '../../../lib/qoe';

export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await creatorApi<ArticleFull>(`/v1/creator/articles/${encodeURIComponent(slug)}`);

  // 404 propre si l'article n'existe pas / n'est pas publié.
  if (!res.ok) {
    notFound();
  }

  const article = res.data;
  const authorsLabel = article.authors.map((a) => a.name ?? a.username ?? a.id).join(', ');

  return (
    <div className="wrap">
      <a href="/" className="back">
        ← Tous les articles
      </a>

      <article>
        <h1 style={{ fontSize: '2rem', letterSpacing: '-0.02em' }}>{article.title}</h1>
        <div className="meta" style={{ marginBottom: '2rem' }}>
          {authorsLabel && <span>Par {authorsLabel}</span>}
          <span>{formatDate(article.publishedAt)}</span>
          <span>{article.readingTime} min de lecture</span>
          {article.isPremium && <span className="badge">Premium</span>}
        </div>

        {/* Contenu HTML signé par l'éditeur qoe.fi (source de confiance). */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: article.contentHtml }} />
      </article>
    </div>
  );
}
