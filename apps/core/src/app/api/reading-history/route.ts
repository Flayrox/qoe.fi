import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const url = new URL(req.url);
    const days = Math.min(30, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10)));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const sessions = await prisma.readingSession.findMany({
      where: { userId: user.id, createdAt: { gte: since } },
      include: {
        article: {
          select: {
            id: true,
            title: true,
            slug: true,
            imageUrl: true,
            readingTime: true,
            publication: { select: { name: true, slug: true, subdomain: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ sessions, count: sessions.length });
  } catch (err) {
    console.error('reading-history error', err);
    return NextResponse.json({ error: 'Internal' }, { status: 500 });
  }
}
