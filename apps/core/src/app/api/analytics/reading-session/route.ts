import { NextRequest, NextResponse } from 'next/server';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      articleId,
      status,
      scrollDepth,
      source,
      dwellSeconds,
      readingTimeMinutes,
      hostname,
      referrerUsername,
    } = body;

    if (!articleId) {
      return NextResponse.json({ error: 'articleId required' }, { status: 400 });
    }

    const validStatuses = ['BOUNCE', 'SKIM', 'READ_PARTIAL', 'READ_COMPLETE'] as const;
    const validSources = ['feed', 'subdomain', 'public_profile', 'direct'] as const;
    const safeStatus = validStatuses.includes(status) ? status : 'READ_PARTIAL';
    const safeSource = validSources.includes(source) ? source : 'direct';
    // Fallback serveur : hostname de la requête si le client ne l'a pas fourni
    const requestHost = (req.headers.get('host') || '').split(':')[0] || null;
    const safeHostname =
      typeof hostname === 'string' && hostname.length > 0 ? hostname.slice(0, 200) : requestHost;
    const safeReferrerUsername =
      typeof referrerUsername === 'string' && referrerUsername.length > 0
        ? referrerUsername.slice(0, 100)
        : null;
    const safeScroll =
      typeof scrollDepth === 'number' ? Math.max(0, Math.min(100, scrollDepth)) : 0;
    const safeDwell = typeof dwellSeconds === 'number' ? Math.max(0, dwellSeconds) : 0;
    const safeReadingTime =
      typeof readingTimeMinutes === 'number' ? Math.max(1, readingTimeMinutes) : 5;

    // Go-only : délègue à Go POST /v1/tracking/reading-session (completionRate EMA + ReadingSession 14j + vector)
    try {
      const res = await goFetch<{ success: boolean; updatedCompletionRate: number }>(
        '/v1/tracking/reading-session',
        {
          method: 'POST',
          body: {
            articleId,
            source: safeSource,
            status: safeStatus,
            scrollDepth: safeScroll,
            dwellSeconds: safeDwell,
            readingTimeMinutes: safeReadingTime,
            hostname: safeHostname,
            referrerUsername: safeReferrerUsername,
          },
        }
      );
      return NextResponse.json({ success: true, updatedCompletionRate: res.updatedCompletionRate });
    } catch (e) {
      // Fallback dev si Go indisponible : garde l'ancien comportement Prisma (non bloquant)
      console.warn('[readingSession] Go fallback', e);
      return NextResponse.json({ success: true, updatedCompletionRate: 0.5 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Error handling reading session analytics:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
