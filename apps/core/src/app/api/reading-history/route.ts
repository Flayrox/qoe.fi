import { NextRequest, NextResponse } from 'next/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const days = Math.min(30, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10)));
    const body = await goFetch<{ sessions: unknown[]; count: number }>(
      `/v1/me/reading-history?days=${days}`
    );
    return NextResponse.json(body);
  } catch (err) {
    console.error('reading-history error', err);
    return NextResponse.json({ error: 'Internal' }, { status: 500 });
  }
}
