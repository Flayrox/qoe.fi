import { NextRequest, NextResponse } from 'next/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { CanonicalDocument } from '@qoe/sdk/types';
import type { ArticleRecord, PaywallCutResult } from '@qoe/sdk/actions/feed';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ ok: false, error: 'Slug requis' }, { status: 400 });
  }

  try {
    const article = await goFetch<
      ArticleRecord & {
        isTruncated: boolean;
        accessGranted: boolean;
        paywallMeta: PaywallCutResult['paywallMeta'];
      }
    >(`/v1/articles/${encodeURIComponent(slug)}`);

    if (!article) {
      return NextResponse.json({ ok: false, error: 'Article introuvable' }, { status: 404 });
    }

    let canonicalDocument: CanonicalDocument | null = null;
    const canReadFull = !article.isPremium || article.accessGranted === true;
    if (canReadFull && article.id) {
      try {
        const doc = await goFetch<CanonicalDocument>(
          `/v1/articles/${encodeURIComponent(article.id)}/document`
        );
        if (doc && Array.isArray(doc.blocks) && doc.text) {
          canonicalDocument = doc;
        }
      } catch {
        // Préchargement optionnel : l'article peut être rendu sans document pré-calculé
      }
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          article: article as ArticleRecord & PaywallCutResult,
          canonicalDocument,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=60',
        },
      }
    );
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      return NextResponse.json({ ok: false, error: 'Article introuvable' }, { status: 404 });
    }
    console.error(`[api/articles/${slug}]`, err);
    return NextResponse.json(
      { ok: false, error: "Erreur lors de la récupération de l'article" },
      { status: 500 }
    );
  }
}
