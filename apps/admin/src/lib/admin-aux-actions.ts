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
import { authzTrailers } from '@/lib/action-result';
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
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de base de données'),
      ...authzTrailers(error),
    };
  }
}

export async function addTrend(hashtag: string, count: number) {
  await verifySuperadmin();
  try {
    let h = hashtag.trim();
    if (!h.startsWith('#')) h = '#' + h;
    if (h.length < 2) return { success: false as const, error: 'Hashtag invalide' };

    await goFetch('/v1/admin/widgets/trends', { method: 'POST', body: { hashtag: h, count } });
    revalidatePath('/admin/widgets');
    revalidatePath('/home');
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur lors de la création'),
      ...authzTrailers(error),
    };
  }
}

export async function deleteTrend(id: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/widgets/trends/${encodeURIComponent(id)}`, { method: 'DELETE' });
    revalidatePath('/admin/widgets');
    revalidatePath('/home');
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de suppression'),
      ...authzTrailers(error),
    };
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
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de mise à jour'),
      ...authzTrailers(error),
    };
  }
}

export async function savePromo(
  id: string | null,
  title: string,
  description: string,
  ctaText: string | null,
  ctaUrl: string | null,
  isActive: boolean,
  imageUrl?: string | null
) {
  await verifySuperadmin();
  try {
    if (!title || !description)
      return { success: false as const, error: 'Titre et description requis' };
    await goFetch('/v1/admin/widgets/promos', {
      method: 'POST',
      body: { id, title, description, ctaText, ctaUrl, imageUrl: imageUrl || null, isActive },
    });
    revalidatePath('/admin/widgets');
    revalidatePath('/home');
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de sauvegarde'),
      ...authzTrailers(error),
    };
  }
}

export async function deletePromo(id: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/widgets/promos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    revalidatePath('/admin/widgets');
    revalidatePath('/home');
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de suppression'),
      ...authzTrailers(error),
    };
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
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de mise à jour'),
      ...authzTrailers(error),
    };
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
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de sauvegarde'),
      ...authzTrailers(error),
    };
  }
}

/** 🚪 Ouvre/ferme les inscriptions (ALLOW_NEW_REGISTRATIONS=false = privé). */
export async function setRegistrationsOpenAction(open: boolean) {
  await verifySuperadmin();
  try {
    await upsertConfigsGo([
      {
        key: 'ALLOW_NEW_REGISTRATIONS',
        value: open ? 'true' : 'false',
        description: 'Inscriptions ouvertes (true) ou privées sur invitation (false)',
      },
    ]);
    revalidatePath('/', 'layout');
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de sauvegarde'),
      ...authzTrailers(error),
    };
  }
}

/** 📩 Invite un email à s'inscrire (accès privé, usage unique). */
export async function addAllowlistAction(email: string, note?: string) {
  await verifySuperadmin();
  try {
    if (!email || !email.includes('@')) return { success: false as const, error: 'Email invalide' };
    await goFetch('/v1/admin/registrations/allowlist', {
      method: 'POST',
      body: { email: email.trim(), note: note?.trim() || null },
    });
    revalidatePath('/admin/config');
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, "Erreur lors de l'invitation"),
      ...authzTrailers(error),
    };
  }
}

/** 📩 Retire une invitation (le compte déjà créé n'est jamais touché). */
export async function deleteAllowlistAction(email: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/registrations/allowlist/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
    revalidatePath('/admin/config');
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de suppression'),
      ...authzTrailers(error),
    };
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
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de sauvegarde'),
      ...authzTrailers(error),
    };
  }
}

export async function deleteSystemConfigAction(key: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/config/${encodeURIComponent(key)}`, { method: 'DELETE' });
    revalidatePath('/', 'layout');
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de suppression'),
      ...authzTrailers(error),
    };
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
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de sauvegarde'),
      ...authzTrailers(error),
    };
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
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de sauvegarde'),
      ...authzTrailers(error),
    };
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
    return { success: true as const, patterns: clean };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de sauvegarde'),
      ...authzTrailers(error),
    };
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
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de sauvegarde'),
      ...authzTrailers(error),
    };
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
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de sauvegarde'),
      ...authzTrailers(error),
    };
  }
}

// ── Notifications & livraisons ───────────────────────────────────────────────

export async function retryNotificationDeliveryAction(deliveryId: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/deliveries/${encodeURIComponent(deliveryId)}/retry`, {
      method: 'POST',
    });
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Relance impossible.'),
      ...authzTrailers(error),
    };
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
    return { success: true as const };
  } catch (error: unknown) {
    console.error('toggleFeatureFlagAction error:', error);
    return {
      success: false as const,
      error: errorMessage(error, 'Impossible de modifier le flag.'),
      ...authzTrailers(error),
    };
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
  await verifySuperadmin();
  try {
    const items = await goFetch<Array<{ key: string; value: string }>>(
      '/v1/admin/config?keys=GLOBAL_ANNOUNCEMENT'
    );
    const raw = items.find((item) => item.key === 'GLOBAL_ANNOUNCEMENT')?.value;
    if (!raw) return null;
    return JSON.parse(raw) as GlobalAnnouncementPayload;
  } catch {
    return null;
  }
}

export async function saveGlobalAnnouncementAction(
  announcement: Omit<GlobalAnnouncementPayload, 'updatedAt'>
) {
  await verifySuperadmin();
  try {
    const payload: GlobalAnnouncementPayload = {
      ...announcement,
      updatedAt: new Date().toISOString(),
    };

    await upsertConfigsGo([
      {
        key: 'GLOBAL_ANNOUNCEMENT',
        value: JSON.stringify(payload),
        description: 'Bannière de notification globale diffusée en haut décran',
      },
    ]);
    revalidatePath('/admin/notifications');
    revalidatePath('/', 'layout');
    return { success: true as const, announcement: payload };
  } catch (error: unknown) {
    console.error('saveGlobalAnnouncementAction error:', error);
    return {
      success: false as const,
      error: errorMessage(error, 'Sauvegarde de l annonce impossible.'),
      ...authzTrailers(error),
    };
  }
}

// ── In-App Placements (Licorne 2027) ─────────────────────────────────────────

export interface AdminPlacementPayload {
  id?: string;
  slot: string;
  format: 'notch_banner' | 'card' | 'callout' | 'modal';
  type: 'promo' | 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  targetAudience: 'all' | 'free_only' | 'plus_only' | 'pro_only';
  priority: number;
  isActive: boolean;
  dismissible: boolean;
  startsAt?: string;
  endsAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function listPlacementsAdminAction(): Promise<AdminPlacementPayload[]> {
  await verifySuperadmin();
  try {
    const res = await goFetch<{ placements: AdminPlacementPayload[] }>('/v1/admin/placements');
    return res.placements || [];
  } catch (err) {
    console.error('listPlacementsAdminAction error:', err);
    return [];
  }
}

export async function createPlacementAdminAction(data: AdminPlacementPayload) {
  await verifySuperadmin();
  try {
    const created = await goFetch<AdminPlacementPayload>('/v1/admin/placements', {
      method: 'POST',
      body: data,
    });
    revalidatePath('/admin/notifications');
    revalidatePath('/', 'layout');
    return { success: true as const, placement: created };
  } catch (error: unknown) {
    console.error('createPlacementAdminAction error:', error);
    return {
      success: false as const,
      error: errorMessage(error, 'Création du placement impossible'),
      ...authzTrailers(error),
    };
  }
}

export async function updatePlacementAdminAction(id: string, data: Partial<AdminPlacementPayload>) {
  await verifySuperadmin();
  try {
    const updated = await goFetch<AdminPlacementPayload>(
      `/v1/admin/placements/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: data,
      }
    );
    revalidatePath('/admin/notifications');
    revalidatePath('/', 'layout');
    return { success: true as const, placement: updated };
  } catch (error: unknown) {
    console.error('updatePlacementAdminAction error:', error);
    return {
      success: false as const,
      error: errorMessage(error, 'Mise à jour impossible'),
      ...authzTrailers(error),
    };
  }
}

export async function deletePlacementAdminAction(id: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/placements/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    revalidatePath('/admin/notifications');
    revalidatePath('/', 'layout');
    return { success: true as const };
  } catch (error: unknown) {
    console.error('deletePlacementAdminAction error:', error);
    return {
      success: false as const,
      error: errorMessage(error, 'Suppression impossible'),
      ...authzTrailers(error),
    };
  }
}
