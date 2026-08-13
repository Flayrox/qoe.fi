'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';

async function checkAdmin() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    throw new Error('Non autorisé');
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
  });

  if (user?.role !== 'superadmin') {
    throw new Error('Non autorisé');
  }
}

/**
 * Valide si une chaîne est un JSON valide
 */
function validateJson(value: string, key: string) {
  if (!value.trim()) return;
  try {
    JSON.parse(value);
  } catch (e) {
    throw new Error(`Le champ "${key}" doit être un JSON valide. Détails: ${(e as Error).message}`);
  }
}

/**
 * Sauvegarde une configuration système frontend
 */
export async function saveFrontendConfig(key: string, value: string, description?: string) {
  await checkAdmin();

  const trimmedKey = key.trim();
  if (!trimmedKey) throw new Error('La clé ne peut pas être vide');

  // Validation JSON pour les structures complexes
  if (
    trimmedKey.includes('hero_reader_items') ||
    trimmedKey.includes('creator_hub_tabs') ||
    trimmedKey.includes('footer_sections')
  ) {
    validateJson(value, trimmedKey);
  }

  await prisma.systemConfig.upsert({
    where: { key: trimmedKey },
    update: {
      value: value,
      ...(description !== undefined && { description: description.trim() }),
    },
    create: {
      key: trimmedKey,
      value: value,
      description: description?.trim() || null,
    },
  });

  revalidatePath('/', 'layout');
  revalidatePath('/admin/frontend');
  return { success: true };
}

/**
 * Sauvegarde plusieurs configurations système en une seule fois
 */
export async function saveMultipleFrontendConfigs(
  configs: Record<string, { value: string; description?: string }>
) {
  await checkAdmin();

  // Valider tous les JSON en premier
  for (const [key, item] of Object.entries(configs)) {
    if (
      key.includes('hero_reader_items') ||
      key.includes('creator_hub_tabs') ||
      key.includes('footer_sections')
    ) {
      validateJson(item.value, key);
    }
  }

  // Transactions Prisma pour tout enregistrer de manière atomique
  await prisma.$transaction(
    Object.entries(configs).map(([key, item]) => {
      return prisma.systemConfig.upsert({
        where: { key },
        update: {
          value: item.value,
          ...(item.description !== undefined && { description: item.description.trim() }),
        },
        create: {
          key,
          value: item.value,
          description: item.description?.trim() || null,
        },
      });
    })
  );

  revalidatePath('/', 'layout');
  revalidatePath('/admin/frontend');
  return { success: true };
}
