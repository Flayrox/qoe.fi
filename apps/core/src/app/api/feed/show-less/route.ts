import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@qoe/db/client';
import { applyNegativeVectorFeedback } from '@qoe/db/feed';
import { createClient } from '@qoe/supabase/server';

/**
 * POST /api/feed/show-less
 * 🚫 « Voir moins de contenu comme ça » — feedback négatif explicite.
 * Body: { articleId?: string, thoughtId?: string }
 * Effets : row ContentFeedback (exclusion du feed via SQL) +
 *          éloignement vectoriel EMA négatif (thèmes rejetés).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { articleId, thoughtId } = body as { articleId?: string; thoughtId?: string };

    if (!articleId && !thoughtId) {
      return NextResponse.json({ error: 'articleId ou thoughtId requis' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // 1. Row ContentFeedback → exclusion SQL du feed perso
    const feedback = await prisma.contentFeedback.upsert({
      where: {
        userId_articleId_thoughtId_type: {
          userId: user.id,
          articleId: articleId ?? '',
          thoughtId: thoughtId ?? '',
          type: 'SHOW_LESS',
        },
      },
      update: {},
      create: {
        userId: user.id,
        articleId: articleId ?? null,
        thoughtId: thoughtId ?? null,
        type: 'SHOW_LESS',
      },
    });

    // 2. Éloignement vectoriel (best-effort — no-op si pas de vecteur)
    let vectorAdjusted = false;
    try {
      const table = articleId ? 'Article' : 'Post';
      const targetId = articleId ?? thoughtId;
      const rows: { embedding_text: string }[] = await prisma.$queryRawUnsafe(
        `SELECT COALESCE("embedding"::text, '') AS embedding_text FROM "${table}" WHERE id = $1`,
        targetId
      );
      if (rows[0]?.embedding_text) {
        const vec = rows[0].embedding_text
          .replace(/[\[\]]/g, '')
          .split(',')
          .map(parseFloat);
        if (vec.length === 512) {
          await applyNegativeVectorFeedback(user.id, vec);
          vectorAdjusted = true;
        }
      }
    } catch (e) {
      console.warn('[show-less] vector push failed', e);
    }

    return NextResponse.json({
      success: true,
      hidden: true,
      vectorAdjusted,
      feedbackId: feedback.id,
    });
  } catch (err) {
    console.error('[show-less] error', err);
    return NextResponse.json({ error: 'Internal' }, { status: 500 });
  }
}
