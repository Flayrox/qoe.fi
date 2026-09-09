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
import { createClient } from '@qoe/supabase/server';

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

/** 🎛️ Sauvegarde les modules d'accès API accordables (SystemConfig API_ACCESS_MODULES, JSON). */
export async function saveApiAccessModulesAction(enabled: string[]) {
  await verifySuperadmin();
  try {
    await goFetch('/v1/admin/api-access/modules', {
      method: 'PATCH',
      body: { enabled },
    });
    revalidatePath('/admin/config');
    revalidatePath('/admin/api');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de sauvegarde') };
  }
}

/** 🛑 Coupure générale de l'API (SystemConfig API_ACCESS_DISABLED). */
export async function setApiAccessDisabledAction(disabled: boolean) {
  await verifySuperadmin();
  try {
    await goFetch('/v1/admin/config', {
      method: 'PUT',
      body: {
        key: 'API_ACCESS_DISABLED',
        value: String(disabled),
        description:
          "Coupure générale de l'API (true = toute l'API refuse les requêtes, sauf console admin / IdP OAuth / webhooks entrants infra / événements internes)",
      },
    });
    revalidatePath('/admin/config');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de sauvegarde') };
  }
}

/** 🚧 Endpoints désactivés à l'échelle de la plateforme (SystemConfig API_DISABLED_ENDPOINTS, JSON). */
export async function saveApiDisabledEndpointsAction(patterns: string[]) {
  await verifySuperadmin();
  try {
    const clean = patterns
      .map((p) => p.trim())
      .filter((p) => p.startsWith('/'))
      .filter((p, i, arr) => arr.indexOf(p) === i);
    await goFetch('/v1/admin/config', {
      method: 'PUT',
      body: {
        key: 'API_DISABLED_ENDPOINTS',
        value: JSON.stringify(clean),
        description:
          'Endpoints désactivés à l’échelle de la plateforme (JSON array de préfixes de chemins)',
      },
    });
    revalidatePath('/admin/config');
    return { success: true, patterns: clean };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de sauvegarde') };
  }
}

/** 🔐 Sauvegarde les méthodes de connexion (clé SystemConfig AUTH_METHODS, JSON). */
export async function saveAuthMethodsAction(methods: {
  google: boolean;
  apple: boolean;
  password: boolean;
  magicLink: boolean;
}) {
  await verifySuperadmin();
  try {
    const value = JSON.stringify(methods);
    validateJson(value, 'AUTH_METHODS');
    await upsertConfigsGo([
      {
        key: 'AUTH_METHODS',
        value,
        description: 'Méthodes de connexion autorisées (JSON {google, apple, password, magicLink})',
      },
    ]);
    revalidatePath('/admin/config');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de sauvegarde') };
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

// ── Feature Flags ────────────────────────────────────────────────────────────

export async function toggleFeatureFlagAction(key: string, isEnabled: boolean) {
  await verifySuperadmin();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('feature_flags').upsert(
      {
        key,
        is_enabled: isEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    if (error) throw error;
    revalidatePath('/admin/config');
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error: unknown) {
    console.error('toggleFeatureFlagAction error:', error);
    return { success: false, error: errorMessage(error, 'Impossible de modifier le flag.') };
  }
}

// ── Global Announcement (Bandeau à courbure inversée) ────────────────────────

export interface GlobalAnnouncementPayload {
  id: string;
  active: boolean;
  message: string;
  type: 'promo' | 'info' | 'warning' | 'critical';
  linkUrl?: string;
  linkText?: string;
  updatedAt?: string;
}

export async function getGlobalAnnouncementAction(): Promise<GlobalAnnouncementPayload | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('SystemConfig')
      .select('value')
      .eq('key', 'GLOBAL_ANNOUNCEMENT')
      .maybeSingle();

    if (error || !data?.value) return null;
    return JSON.parse(data.value) as GlobalAnnouncementPayload;
  } catch {
    return null;
  }
}

export async function saveGlobalAnnouncementAction(
  announcement: Omit<GlobalAnnouncementPayload, 'updatedAt'>
) {
  await verifySuperadmin();
  try {
    const supabase = await createClient();
    const payload: GlobalAnnouncementPayload = {
      ...announcement,
      updatedAt: new Date().toISOString(),
    };

    const { error } = await supabase.from('SystemConfig').upsert(
      {
        key: 'GLOBAL_ANNOUNCEMENT',
        value: JSON.stringify(payload),
        description: 'Bannière de notification globale diffusée en haut décran',
        updatedAt: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    if (error) throw error;
    revalidatePath('/admin/notifications');
    revalidatePath('/', 'layout');
    return { success: true, announcement: payload };
  } catch (error: unknown) {
    console.error('saveGlobalAnnouncementAction error:', error);
    return { success: false, error: errorMessage(error, 'Sauvegarde de l annonce impossible.') };
  }
}
