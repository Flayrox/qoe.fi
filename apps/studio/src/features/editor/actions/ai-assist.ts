'use server';

import { getCurrentUser } from '@qoe/auth/current-user';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export type EditorAssistTask = 'title' | 'seo';

export type EditorAssistActionResult =
  { ok: true; suggestions: string[]; remaining: number } | { ok: false; error: string };

/**
 * Aide ciblée : titres ou méta description. L'API applique le gate Plus et le
 * quota IA commun ; on ne réécrit jamais le corps de l'article.
 */
export async function generateEditorAssistAction(input: {
  task: EditorAssistTask;
  text: string;
  context?: string;
}): Promise<EditorAssistActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Non authentifié' };

  try {
    const res = await goFetch<{
      task: string;
      suggestions: string[];
      usage: { remaining: number };
    }>('/v1/ai/editor', {
      method: 'POST',
      body: {
        task: input.task,
        text: input.text,
        context: input.context ?? '',
      },
    });
    return {
      ok: true,
      suggestions: (res.suggestions ?? []).filter(Boolean),
      remaining: res.usage?.remaining ?? 0,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "L'assistant IA est indisponible pour le moment.",
    };
  }
}
