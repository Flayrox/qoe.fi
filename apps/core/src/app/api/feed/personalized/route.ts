import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { buildVectorFeedPage } from '@/lib/vector-feed';

/**
 * GET /api/feed/personalized?limit=20&offset=20
 * Pages suivantes du flux « Pour vous » (moteur vectoriel Two-Tower).
 * Auth optionnelle : connecté → affinité sémantique, sinon cold-start.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? '20');
  const rawOffset = Number(req.nextUrl.searchParams.get('offset') ?? '0');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

  try {
    const page = await buildVectorFeedPage({ userId: user?.id ?? null, limit, offset });
    return NextResponse.json(page);
  } catch (err) {
    console.error('[api/feed/personalized]', err);
    return NextResponse.json({ error: 'FEED_FAILED' }, { status: 500 });
  }
}
