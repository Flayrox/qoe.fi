import { NextRequest, NextResponse } from 'next/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

/**
 * POST /api/feed/show-less
 * 🚫 « Voir moins de contenu comme ça » — Go-only POST /v1/feed/show-less (ContentFeedback + EMA négatif)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { articleId, thoughtId } = body as { articleId?: string; thoughtId?: string };

    if (!articleId && !thoughtId) {
      return NextResponse.json({ error: 'articleId ou thoughtId requis' }, { status: 400 });
    }

    const res = await goFetch<{
      success: boolean;
      hidden: boolean;
      vectorAdjusted: boolean;
      feedbackId: string;
    }>('/v1/feed/show-less', {
      method: 'POST',
      body: { articleId, thoughtId },
    });
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal';
    const status = (err as { status?: number })?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
