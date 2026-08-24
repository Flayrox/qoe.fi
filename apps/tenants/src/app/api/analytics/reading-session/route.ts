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

    // Fallback serveur : hostname de la requête (tenant) si absent du payload
    const requestHost = (req.headers.get('host') || '').split(':')[0] || null;
    const safeHostname =
      typeof hostname === 'string' && hostname.length > 0 ? hostname.slice(0, 200) : requestHost;

    // Go-first : POST /v1/tracking/reading-session — le service Go gère la
    // normalisation, la mise à jour du completionRate, la session de lecture
    // et le vecteur utilisateur (ex-parité du repo Prisma). Le token Supabase
    // est attaché par goFetch (lecteur connecté → session + vecteur).
    const data = await goFetch<{ success: boolean; updatedCompletionRate?: number }>(
      '/v1/tracking/reading-session',
      {
        method: 'POST',
        body: {
          articleId,
          status,
          scrollDepth,
          source,
          dwellSeconds,
          readingTimeMinutes,
          hostname: safeHostname,
          referrerUsername,
        },
      }
    );
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Error handling reading session analytics:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
