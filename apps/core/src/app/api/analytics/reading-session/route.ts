import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@qoe/db/client';
import { updateUserVectorOnInteraction } from '@qoe/db/feed';
import { createClient } from '@qoe/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { articleId, status, scrollDepth } = body;

    if (!articleId) {
      return NextResponse.json({ error: 'articleId required' }, { status: 400 });
    }

    // Récupérer l'utilisateur courant s'il est connecté
    let currentUserId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) currentUserId = user.id;
    } catch {}

    // Récupérer l'article et son embedding
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

    // 1. Mise à jour de la complétion moyenne de l'article dans Postgres
    let sessionRate = 0.5;
    if (status === 'READ_COMPLETE') sessionRate = 1.0;
    else if (status === 'SKIM') sessionRate = 0.2;
    else if (status === 'READ_PARTIAL') sessionRate = Math.min(0.8, (scrollDepth || 50) / 100);
    else if (status === 'BOUNCE') sessionRate = 0.05;

    const currentRate = article.completionRate || 0.8;
    const updatedCompletionRate = Math.round((currentRate * 0.9 + sessionRate * 0.1) * 100) / 100;

    await prisma.article.update({
      where: { id: articleId },
      data: { completionRate: updatedCompletionRate },
    });

    // 2. Si l'utilisateur est connecté et a lu l'article de façon approfondie,
    // déclencher l'ajustement dynamique de son vecteur d'intérêt (EMA) !
    if (currentUserId && (status === 'READ_COMPLETE' || status === 'READ_PARTIAL')) {
      const rows: { embedding_text: string }[] = await prisma.$queryRawUnsafe(
        `SELECT COALESCE("embedding"::text, '') AS embedding_text FROM "Article" WHERE id = $1`,
        articleId
      );

      if (rows[0] && rows[0].embedding_text) {
        const str = rows[0].embedding_text.replace(/[\[\]]/g, '');
        const artVec = str.split(',').map((v) => parseFloat(v));
        if (artVec.length === 512) {
          await updateUserVectorOnInteraction(
            currentUserId,
            artVec,
            status === 'READ_COMPLETE' ? 'READ_COMPLETE' : 'CLICK'
          );
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
