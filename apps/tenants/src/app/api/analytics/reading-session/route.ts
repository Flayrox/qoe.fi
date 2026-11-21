import { NextRequest, NextResponse } from 'next/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }
    const {
      articleId,
      status,
      scrollDepth,
      source,
      dwellSeconds,
      readingTimeMinutes,
      hostname,
      referrerUsername,
    } = body as Record<string, unknown>;

    // Validation de type : un corps forgé (objet à la place d'un identifiant,
    // chaîne à la place d'une profondeur) partait tel quel au backend.
    if (typeof articleId !== 'string' || !articleId.trim()) {
      return NextResponse.json({ error: 'articleId required' }, { status: 400 });
    }
    const numeric = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    const label = (value: unknown, max: number): string | undefined =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

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
          articleId: articleId.slice(0, 100),
          status: label(status, 40),
          scrollDepth: numeric(scrollDepth),
          source: label(source, 40),
          dwellSeconds: numeric(dwellSeconds),
          readingTimeMinutes: numeric(readingTimeMinutes),
          hostname: safeHostname,
          referrerUsername: label(referrerUsername, 100),
        },
      }
    );
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    // Détail dans les logs, message générique au client : le message interne
    // (hôte, table, requête) fuyait dans la réponse.
    console.error('Error handling reading session analytics:', err);
    return NextResponse.json({ error: 'Session de lecture non enregistrée.' }, { status: 500 });
  }
}
