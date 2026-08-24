'use server';

// =====================================================================
// 🛡️ admin-aux-actions — actions des pages auxiliaires de la console
// =====================================================================
// Go en primaire : endpoints /v1/admin/widgets/*, /v1/admin/config,
// /v1/admin/deliveries/* (module Go `admin`, réservé superadmin).
// Fallback Prisma dev (verifySuperadmin + écritures) si QOE_API_URL absent.
// =====================================================================

import { createClient as createServerClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { revalidatePath } from 'next/cache';
import { goFetch, isGoEnabled } from '@qoe/api-client/actions/utils/go-client';

async function verifySuperadmin() {
  const supabase = await createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('Unauthorized');
  const dbUser = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (dbUser?.role !== 'superadmin') throw new Error('Forbidden');
  return dbUser;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// ── Widgets & tendances ──────────────────────────────────────────────────────

export async function toggleFeaturedArticle(articleId: string) {
  await verifySuperadmin();
  try {
    if (isGoEnabled()) {
      await goFetch('/v1/admin/widgets/featured', {
        method: 'POST',
        body: { articleId, featured: true },
      });
    } else {
      // 🐢 Fallback dev : Prisma (un seul à la une).
      const article = await prisma.article.findUnique({
        where: { id: articleId },
        select: { isEditorPick: true },
      });
      if (!article) return { success: false, error: 'Article non trouvé' };
      if (!article.isEditorPick) {
        await prisma.article.updateMany({
          where: { isEditorPick: true },
          data: { isEditorPick: false },
        });
      }
      await prisma.article.update({
        where: { id: articleId },
        data: { isEditorPick: !article.isEditorPick },
      });
    }
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

    if (isGoEnabled()) {
      await goFetch('/v1/admin/widgets/trends', { method: 'POST', body: { hashtag: h, count } });
    } else {
      await prisma.trend.upsert({
        where: { hashtag: h },
        update: { count },
        create: { hashtag: h, count },
      });
    }
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
    if (isGoEnabled()) {
      await goFetch(`/v1/admin/widgets/trends/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } else {
      await prisma.trend.delete({ where: { id } });
    }
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
    if (isGoEnabled()) {
      await goFetch(`/v1/admin/widgets/trends/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { count },
      });
    } else {
      await prisma.trend.update({ where: { id }, data: { count } });
    }
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
    if (isGoEnabled()) {
      await goFetch('/v1/admin/widgets/promos', {
        method: 'POST',
        body: { id, title, description, ctaText, ctaUrl, isActive },
      });
    } else {
      if (id) {
        await prisma.partnerPromo.update({
          where: { id },
          data: { title, description, ctaText, ctaUrl, isActive },
        });
      } else {
        await prisma.partnerPromo.create({
          data: { title, description, ctaText, ctaUrl, isActive },
        });
      }
    }
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
    if (isGoEnabled()) {
      await goFetch(`/v1/admin/widgets/promos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } else {
      await prisma.partnerPromo.delete({ where: { id } });
    }
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
    if (isGoEnabled()) {
      await goFetch(`/v1/admin/widgets/promos/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { isActive },
      });
    } else {
      await prisma.partnerPromo.update({ where: { id }, data: { isActive } });
    }
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
    if (isGoEnabled()) {
      await upsertConfigsGo([
        {
          key: input.key.trim().toUpperCase(),
          value: input.value.trim(),
          description: input.description?.trim(),
        },
      ]);
    } else {
      await prisma.systemConfig.upsert({
        where: { key: input.key.trim().toUpperCase() },
        update: { value: input.value.trim(), description: input.description?.trim() },
        create: {
          key: input.key.trim().toUpperCase(),
          value: input.value.trim(),
          description: input.description?.trim() || null,
        },
      });
    }
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Erreur de sauvegarde') };
  }
}

export async function deleteSystemConfigAction(key: string) {
  await verifySuperadmin();
  try {
    if (isGoEnabled()) {
      await goFetch(`/v1/admin/config/${encodeURIComponent(key)}`, { method: 'DELETE' });
    } else {
      await prisma.systemConfig.delete({ where: { key } });
    }
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
    if (isGoEnabled()) {
      await upsertConfigsGo(
        Object.entries(configs).map(([key, item]) => ({
          key,
          value: item.value,
          description: item.description,
        }))
      );
    } else {
      await prisma.$transaction(
        Object.entries(configs).map(([key, item]) =>
          prisma.systemConfig.upsert({
            where: { key },
            update: {
              value: item.value,
              ...(item.description !== undefined && { description: item.description.trim() }),
            },
            create: { key, value: item.value, description: item.description?.trim() || null },
          })
        )
      );
    }
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
    if (isGoEnabled()) {
      await goFetch(`/v1/admin/deliveries/${encodeURIComponent(deliveryId)}/retry`, {
        method: 'POST',
      });
    } else {
      await prisma.notificationDelivery.updateMany({
        where: { id: deliveryId, status: { in: ['FAILED', 'DISABLED'] } },
        data: { status: 'QUEUED', availableAt: new Date(), lastError: null },
      });
    }
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: errorMessage(error, 'Relance impossible.') };
  }
}
