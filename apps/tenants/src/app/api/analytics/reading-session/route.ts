import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@qoe/db/client';
import { updateUserVectorOnInteraction } from '@qoe/db/feed';
import { createClient } from '@qoe/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { articleId, status, scrollDepth, source, dwellSeconds, readingTimeMinutes } = body;

    if (!articleId) {
      return NextResponse.json({ error: 'articleId required' }, { status: 400 });
    }

    const validStatuses = ['BOUNCE', 'SKIM', 'READ_PARTIAL', 'READ_COMPLETE'] as const;
    const validSources = ['feed', 'subdomain', 'public_profile', 'direct'] as const;
    const safeStatus = validStatuses.includes(status) ? status : 'READ_PARTIAL';
    const safeSource = validSources.includes(source) ? source : 'subdomain';
    const safeScroll =
      typeof scrollDepth === 'number' ? Math.max(0, Math.min(100, scrollDepth)) : 0;
    const safeDwell = typeof dwellSeconds === 'number' ? Math.max(0, dwellSeconds) : 0;
    const safeReadingTime =
      typeof readingTimeMinutes === 'number' ? Math.max(1, readingTimeMinutes) : 5;

    let currentUserId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) currentUserId = user.id;
    } catch {}

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        completionRate: true,
      },
    });

    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    let sessionRate = 0.5;
    if (safeStatus === 'READ_COMPLETE') sessionRate = 1.0;
    else if (safeStatus === 'SKIM') sessionRate = 0.2;
    else if (safeStatus === 'READ_PARTIAL') sessionRate = Math.min(0.8, safeScroll / 100);
    else if (safeStatus === 'BOUNCE') sessionRate = 0.05;

    const currentRate = typeof article.completionRate === 'number' ? article.completionRate : 0.5;
    const updatedCompletionRate = Math.round((currentRate * 0.9 + sessionRate * 0.1) * 100) / 100;

    await prisma.article.update({
      where: { id: articleId },
      data: { completionRate: updatedCompletionRate },
    });

    if (currentUserId) {
      try {
        await prisma.readingSession.create({
          data: {
            articleId,
            userId: currentUserId,
            source: safeSource,
            status: safeStatus,
            scrollDepth: safeScroll,
            dwellSeconds: safeDwell,
            readingTimeMinutes: safeReadingTime,
          },
        });
        const cutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000);
        await prisma.readingSession.deleteMany({
          where: { userId: currentUserId, createdAt: { lt: cutoff } },
        });
      } catch (e) {
        console.warn('[readingSession] create failed', e);
      }
    }

    if (currentUserId && (safeStatus === 'READ_COMPLETE' || safeStatus === 'READ_PARTIAL')) {
      const rows: { embedding_text: string }[] = await prisma.$queryRawUnsafe(
        `SELECT COALESCE("embedding"::text, '') AS embedding_text FROM "Article" WHERE id = $1`,
        articleId
      );

      if (rows[0] && rows[0].embedding_text) {
        const str = rows[0].embedding_text.replace(/[\[\]]/g, '');
        const artVec = str.split(',').map((v) => parseFloat(v));
        if (artVec.length === 512) {
          const interactionType = safeStatus === 'READ_COMPLETE' ? 'READ_COMPLETE' : 'READ_PARTIAL';
          await updateUserVectorOnInteraction(currentUserId, artVec, interactionType);
        }
      }
    }

    return NextResponse.json({ success: true, updatedCompletionRate });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Error handling reading session analytics:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
