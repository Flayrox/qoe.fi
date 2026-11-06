'use server';

import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { assertCapability } from '@/lib/admin-identity';

/** Met à jour l'état opérationnel d'une fonctionnalité. */
export async function updateFeatureAction(formData: FormData): Promise<void> {
  await assertCapability('admin.flags.write');
  const key = String(formData.get('key') || '').trim();
  if (!key) throw new Error('Clé de fonctionnalité requise');
  await goFetch(`/v1/admin/features/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: {
      status: String(formData.get('status') || 'coming-soon'),
      notifyEnabled: formData.get('notifyEnabled') === 'on',
      flagKey: String(formData.get('flagKey') || ''),
      href: String(formData.get('href') || ''),
    },
  });
  revalidatePath('/admin/features');
  revalidatePath('/admin/config');
}
