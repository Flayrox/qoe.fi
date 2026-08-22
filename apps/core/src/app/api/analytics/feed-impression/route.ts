import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';

/**
 * POST /api/analytics/feed-impression
 * 👁️ Batch d'impressions du feed (IntersectionObserver, fire-once par item).
 * Body: { items: [{ itemType, itemId, position, isDiscovery }] }
 * Purge 30j intégrée. Silencieux (analytics ne doit jamais casser l'UX).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items.slice(0, 100) : [];
    if (items.length === 0) {
      return NextResponse.json({ success: true, inserted: 0 });
    }

    let currentUserId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) currentUserId = user.id;
    } catch {}

    const rows = items
      .filter(
        (i: { itemType?: string; itemId?: string }) =>
          (i.itemType === 'ARTICLE' || i.itemType === 'THOUGHT') &&
          typeof i.itemId === 'string' &&
          i.itemId.length > 0
      )
      .map((i: { itemType: string; itemId: string; position?: number; isDiscovery?: boolean }) => ({
        userId: currentUserId,
        itemType: i.itemType,
        itemId: i.itemId,
        position: typeof i.position === 'number' ? Math.max(0, Math.min(500, i.position)) : 0,
        isDiscovery: Boolean(i.isDiscovery),
      }));

    if (rows.length === 0) {
      return NextResponse.json({ success: true, inserted: 0 });
    }

    const res = await prisma.feedImpression.createMany({ data: rows });

    // Purge 30j best-effort (1 fois sur ~20 appels pour limiter le coût)
    if (Math.random() < 0.05) {
      const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      await prisma.feedImpression
        .deleteMany({ where: { createdAt: { lt: cutoff } } })
        .catch(() => {});
    }

    return NextResponse.json({ success: true, inserted: res.count });
  } catch (err) {
    // Analytics : silencieux volontairement
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
