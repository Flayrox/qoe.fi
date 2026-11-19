import { NextRequest, NextResponse } from 'next/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    // `?days=abc` donnait `NaN` et partait tel quel vers Go : on retombe sur
    // la fenêtre par défaut au lieu de relayer une valeur invalide.
    const parsedDays = Number.parseInt(url.searchParams.get('days') ?? '', 10);
    const days = Number.isFinite(parsedDays) ? Math.min(30, Math.max(1, parsedDays)) : 14;
    const body = await goFetch<{ sessions: unknown[]; count: number }>(
      `/v1/me/reading-history?days=${days}`
    );
    return NextResponse.json(body);
  } catch (err) {
    console.error('reading-history error', err);
    return NextResponse.json({ error: 'Internal' }, { status: 500 });
  }
}
