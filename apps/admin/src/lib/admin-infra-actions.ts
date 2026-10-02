'use server';

// =====================================================================
// 🏗️ admin-infra-actions — campagnes staff (création, cycle de vie)
// =====================================================================
// Une campagne est un envoi de masse : la création et CHAQUE transition
// revérifient la capacité `admin.campaigns.write` (défense en profondeur), et le
// cycle de vie reste celui du serveur — soumettre, approuver, lancer, suspendre,
// annuler. La console ne saute jamais une étape : approuver est un acte distinct
// de rédiger.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { assertCapability } from '@/lib/admin-identity';
import type { StaffCampaignInput } from '@/lib/admin-infra-data';

export interface InfraActionResult {
  ok: boolean;
  error?: string;
}

function readableError(err: unknown): string {
  return err instanceof Error ? err.message : 'Action impossible';
}

/** Crée un brouillon de campagne (le contenu est validé par le serveur). */
export async function createCampaignAction(input: StaffCampaignInput): Promise<InfraActionResult> {
  try {
    await assertCapability('admin.campaigns.write');
    await goFetch('/v1/admin/campaigns', {
      method: 'POST',
      body: {
        type: input.type,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText ?? '',
        subjectEn: input.subjectEn ?? '',
        bodyHtmlEn: input.bodyHtmlEn ?? '',
        bodyTextEn: input.bodyTextEn ?? '',
        audienceType: input.audienceType,
        audiencePublicationId: input.audiencePublicationId ?? '',
        scheduledAt: input.scheduledAt ?? '',
      },
    });
    revalidatePath('/admin/campaigns');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readableError(err) };
  }
}

/** Transition de cycle de vie : submit, approve, start, pause, cancel. */
export async function campaignTransitionAction(input: {
  campaignId: string;
  action: string;
}): Promise<InfraActionResult> {
  try {
    await assertCapability('admin.campaigns.write');
    await goFetch(
      `/v1/admin/campaigns/${encodeURIComponent(input.campaignId)}/${encodeURIComponent(input.action)}`,
      { method: 'POST', body: {} }
    );
    revalidatePath('/admin/campaigns');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readableError(err) };
  }
}
