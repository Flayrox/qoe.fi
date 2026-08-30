'use server';

// =====================================================================
// 🛡️ admin-aux-actions — actions des pages auxiliaires de la console
// =====================================================================
// Go en primaire : endpoints /v1/admin/widgets/*, /v1/admin/config,
// /v1/admin/deliveries/* (module Go `admin`, réservé superadmin).
// Fallback Prisma dev (verifySuperadmin + écritures) si QOE_API_URL absent.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

async function verifySuperadmin() {
  // Go vérifie le rôle superadmin sur chaque route admin (403 sinon).
  try {
    await goFetch('/v1/admin/dashboard');
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 403) throw new Error('Forbidden');
    throw err;
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// ── Widgets & tendances ──────────────────────────────────────────────────────

export async function toggleFeaturedArticle(articleId: string) {
  await verifySuperadmin();
  try {
    await goFetch('/v1/admin/widgets/featured', {
      method: 'POST',
      body: { articleId, featured: true },
    });
    revalidatePath('/admin/widgets');
    revalidatePath('/home');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de base de données') };
  }
}

export async function addTrend(hashtag: string, count: number) {
  await verifySuperadmin();
  try {
    let h = hashtag.trim();
    if (!h.startsWith('#')) h = '#' + h;
    if (h.length < 2) return { success: false, error: 'Hashtag invalide' };

    await goFetch('/v1/admin/widgets/trends', { method: 'POST', body: { hashtag: h, count } });
    revalidatePath('/admin/widgets');
    revalidatePath('/home');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur lors de la création') };
  }
}

export async function deleteTrend(id: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/widgets/trends/${encodeURIComponent(id)}`, { method: 'DELETE' });
    revalidatePath('/admin/widgets');
    revalidatePath('/home');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de suppression') };
  }
}

export async function updateTrendCount(id: string, count: number) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/widgets/trends/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { count },
    });
    revalidatePath('/admin/widgets');
    revalidatePath('/home');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de mise à jour') };
  }
}

export async function savePromo(
  id: string | null,
  title: string,
  description: string,
  ctaText: string | null,
  ctaUrl: string | null,
  isActive: boolean
) {
  await verifySuperadmin();
  try {
    if (!title || !description) return { success: false, error: 'Titre et description requis' };
    await goFetch('/v1/admin/widgets/promos', {
      method: 'POST',
      body: { id, title, description, ctaText, ctaUrl, isActive },
    });
    revalidatePath('/admin/widgets');
    revalidatePath('/home');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de sauvegarde') };
  }
}

export async function deletePromo(id: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/widgets/promos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    revalidatePath('/admin/widgets');
    revalidatePath('/home');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de suppression') };
  }
}

export async function togglePromoActive(id: string, isActive: boolean) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/widgets/promos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { isActive },
    });
    revalidatePath('/admin/widgets');
    revalidatePath('/home');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de mise à jour') };
  }
}

// ── Feature flags / config / frontend / traductions ─────────────────────────

function validateJson(value: string, key: string) {
  if (!value.trim()) return;
  try {
    JSON.parse(value);
  } catch (e) {
    throw new Error(`Le champ "${key}" doit être un JSON valide. Détails: ${(e as Error).message}`);
  }
}

async function upsertConfigsGo(
  items: { key: string; value: string; description?: string | null }[]
) {
  await goFetch('/v1/admin/config', {
    method: 'PUT',
    body: items.map((i) => ({
      key: i.key,
      value: i.value,
      description: i.description ?? null,
    })),
  });
}

/** 💾 Sauvegarde une config système (page config + traductions). */
export async function setSystemConfigAction(input: {
  key: string;
  value: string;
  description?: string;
}) {
  await verifySuperadmin();
  try {
    await upsertConfigsGo([
      {
        key: input.key.trim().toUpperCase(),
        value: input.value.trim(),
        description: input.description?.trim(),
      },
    ]);
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de sauvegarde') };
  }
}

export async function updateReservedIdentifiersAction(
  kind: 'username' | 'subdomain',
  values: string[]
) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/reserved-identifiers/${kind}`, {
      method: 'PUT',
      body: { values },
    });
    revalidatePath('/admin/config');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de sauvegarde') };
  }
}

export async function deleteSystemConfigAction(key: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/config/${encodeURIComponent(key)}`, { method: 'DELETE' });
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de suppression') };
  }
}

/** 🎨 Sauvegarde les configs frontend (page frontend — JSON validé). */
export async function saveMultipleFrontendConfigs(
  configs: Record<string, { value: string; description?: string }>
) {
  await verifySuperadmin();

  for (const [key, item] of Object.entries(configs)) {
    if (
      key.includes('hero_reader_items') ||
      key.includes('creator_hub_tabs') ||
      key.includes('footer_sections')
    ) {
      validateJson(item.value, key);
    }
  }

  try {
    await upsertConfigsGo(
      Object.entries(configs).map(([key, item]) => ({
        key,
        value: item.value,
        description: item.description,
      }))
    );
    revalidatePath('/', 'layout');
    revalidatePath('/admin/frontend');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de sauvegarde') };
  }
}

// ── Notifications & livraisons ───────────────────────────────────────────────

export async function retryNotificationDeliveryAction(deliveryId: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/deliveries/${encodeURIComponent(deliveryId)}/retry`, {
      method: 'POST',
    });
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Relance impossible.') };
  }
}
