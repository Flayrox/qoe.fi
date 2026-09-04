import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { type CanonicalDocument } from '@qoe/ui/annotations';
import { ArticleAnnotatorView } from '@/components/social/ArticleAnnotatorView';
import { parseSpotlightParams } from '@/lib/spotlight';
import { notFound } from 'next/navigation';

// Contrat de l'endpoint Go GET /v1/articles/{slug} (mode slug seul : premier
// article publié, contenu complet — parité findFirstBySlug Prisma).
interface GoArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  readingTime?: number;
  createdAt: string;
  isPremium?: boolean;
  accessGranted?: boolean;
  author: {
    id: string;
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
  };
  publication?: {
    subdomain?: string | null;
    customDomain?: string | null;
  } | null;
}

async function fetchArticleBySlug(slug: string): Promise<GoArticle | null> {
  // Go (backend-of-record, requis en Phase 3) : GET /v1/articles/{slug}.
  // Retourne null sur 404 (goFetch lève avec err.status).
  try {
    return await goFetch<GoArticle>(`/v1/articles/${encodeURIComponent(slug)}`);
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

/**
 * Document canonique d'un article (blocs + texte plat + offsets).
 * GET /v1/articles/{id}/document — base des ancres des surlignages.
 * null si indisponible → repli sur le moteur hérité (TreeWalker).
 */
async function fetchCanonicalDocument(articleId: string): Promise<CanonicalDocument | null> {
  try {
    const doc = await goFetch<CanonicalDocument>(
      `/v1/articles/${encodeURIComponent(articleId)}/document`
    );
    if (!doc || !Array.isArray(doc.blocks) || !doc.text) return null;
    return doc;
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    console.error('[core] fetchCanonicalDocument:', err);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const article = await fetchArticleBySlug(resolvedParams.slug);

  if (!article) {
    return {
      title: 'Article introuvable | qoe.fi',
    };
  }

  return {
    title: `${article.title} | qoe.fi`,
    description: article.content
      ? article.content.replace(/<[^>]*>?/gm, '').slice(0, 160)
      : undefined,
  };
}

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ hlStart?: string; hlEnd?: string; hlSha?: string }>;
}) {
  const resolvedParams = await params;
  const article = await fetchArticleBySlug(resolvedParams.slug);

  if (!article) {
    notFound();
  }

  // 🔦 Deep-link citation → article (tranche 6-b) : passage cité à mettre en
  // avant. Strictement validé — toute entrée invalide → null (lecture normale).
  const spotlight = parseSpotlightParams(await searchParams);

  // Tranche 1-c : document canonique (rendu par blocs + marques par offsets).
  // Uniquement quand l'accès complet est acquis — ne jamais télécharger le
  // document complet d'un article verrouillé (fuite du contenu payant).
  const canReadFull = !article.isPremium || article.accessGranted === true;
  const canonicalDocument = canReadFull ? await fetchCanonicalDocument(article.id) : null;

  return (
    <main className="w-full min-h-screen bg-background">
      <ArticleAnnotatorView
        article={article}
        canonicalDocument={canonicalDocument}
        spotlight={spotlight}
      />
    </main>
  );
}
