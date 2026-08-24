import { NextRequest, NextResponse } from 'next/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

/**
 * POST /api/analytics/feed-impression
 * 👁️ Batch d'impressions du feed (IntersectionObserver, fire-once par item).
 * Go-only : POST /v1/tracking/feed-impression (purge 30j côté Go).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items.slice(0, 100) : [];
    if (items.length === 0) {
      return NextResponse.json({ success: true, inserted: 0 });
    }
    try {
      const res = await goFetch<{ success: boolean; inserted: number }>(
        '/v1/tracking/feed-impression',
        {
          method: 'POST',
          body: { items },
        }
      );
      return NextResponse.json({ success: true, inserted: res.inserted });
    } catch {
      return NextResponse.json({ success: false }, { status: 200 });
    }
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
