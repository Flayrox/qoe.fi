'use server';

// =====================================================================
// 📬 actions digest — configuration et aperçu
// =====================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@qoe/supabase/server';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export interface DigestConfig {
  enabled: boolean;
  weekday: number;
  hour: number;
  maxArticles: number;
  intro: string;
}

export interface DigestPreview {
  subject: string;
  html: string;
  count: number;
}

async function context(): Promise<{ publisherId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');
  const workspace = await getActiveWorkspace(user.id);
  return { publisherId: workspace.publisherId };
}

export async function saveDigestAction(
  input: DigestConfig
): Promise<{ success: true; config: DigestConfig } | { success: false; error: string }> {
  try {
    const { publisherId } = await context();
    const res = await goFetch<{ config: DigestConfig }>(
      `/v1/creator/newsletter/digest?publisherId=${encodeURIComponent(publisherId)}`,
      { method: 'PUT', body: input }
    );
    revalidatePath('/digest');
    return { success: true, config: res.config };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Enregistrement impossible.',
    };
  }
}

export async function previewDigestAction(): Promise<
  { success: true; preview: DigestPreview } | { success: false; error: string }
> {
  try {
    const { publisherId } = await context();
    const preview = await goFetch<DigestPreview>(
      `/v1/creator/newsletter/digest/preview?publisherId=${encodeURIComponent(publisherId)}`,
      { method: 'POST', body: {} }
    );
    return { success: true, preview };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Aperçu indisponible.',
    };
  }
}
