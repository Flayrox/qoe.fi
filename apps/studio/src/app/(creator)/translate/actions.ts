'use server';

// =====================================================================
// 🌍 actions traduction — proxy fin vers /v1/ai/translate
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { t } from '@lingui/core/macro';

export async function translateArticleAction(input: {
  text: string;
  target: string;
}): Promise<{ success: true; text: string } | { success: false; error: string }> {
  try {
    const res = await goFetch<{ text: string }>('/v1/ai/translate', {
      method: 'POST',
      body: { text: input.text, target: input.target },
    });
    return { success: true, text: res.text };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    return {
      success: false,
      error:
        code === 'AI_UNAVAILABLE' || code === 'AI_DISABLED'
          ? t`Traduction indisponible : aucun fournisseur IA configuré sur cette instance.`
          : err instanceof Error
            ? err.message
            : 'Traduction impossible.',
    };
  }
}
