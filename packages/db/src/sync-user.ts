// =====================================================================
// 🔄 syncUserFromAuth — synchronisation User (public) ↔ auth.users (Supabase)
// =====================================================================
// Utilisé par les routes /auth/callback de chaque app (core, tenants,
// studio) pour garantir que la ligne User existe et reflète les métadonnées
// du profil (nom, username, genre, tranche d'âge, pronoms, pays, langue).
// =====================================================================

import type { Gender, AgeRange } from '@prisma/client';

// Type structurel minimal (évite une dépendance @supabase dans @qoe/db).
export interface AuthUserLike {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

type SyncResult = {
  /** true si la ligne User vient d'être créée */
  created: boolean;
  /** true si l'utilisateur doit passer par l'onboarding */
  needsOnboarding: boolean;
};

/**
 * Crée (ou met à jour) la ligne User à partir d'un utilisateur Supabase.
 * Retourne le chemin à rediriger : '/onboarding' pour les nouveaux comptes.
 */
export async function syncUserFromAuth(user: AuthUserLike): Promise<SyncResult> {
  const { prisma } = await import('./client');
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  const enumStr = (v: unknown, allowed: readonly string[]): string | undefined => {
    const s = str(v);
    return s && allowed.includes(s) ? s : undefined;
  };

  const name = str(meta.name) ?? str(meta.full_name) ?? undefined;
  const username = str(meta.username) ?? undefined;
  const gender = enumStr(meta.gender, [
    'FEMALE',
    'MALE',
    'NON_BINARY',
    'OTHER',
    'PREFER_NOT_TO_SAY',
  ]) as Gender | undefined;
  const ageRange = enumStr(meta.ageRange, [
    'UNDER_18',
    'AGE_18_24',
    'AGE_25_34',
    'AGE_35_44',
    'AGE_45_54',
    'AGE_55_64',
    'AGE_65_PLUS',
    'PREFER_NOT_TO_SAY',
  ]) as AgeRange | undefined;
  const pronouns = str(meta.pronouns);
  const countryCode = str(meta.countryCode);
  const languageCode = str(meta.languageCode);

  const existing = await prisma.user.findUnique({ where: { id: user.id } });

  if (!existing) {
    const emailPrefix = user.email ? user.email.split('@')[0] : 'user';
    let finalUsername = username || emailPrefix.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'user';

    // Garantit l'unicité du username (suffixe aléatoire si pris).
    const taken = await prisma.user.findUnique({ where: { username: finalUsername } });
    if (taken) {
      finalUsername = `${finalUsername}_${crypto.randomUUID().replace(/-/g, '').substring(0, 6)}`;
    }

    await prisma.user.create({
      data: {
        id: user.id,
        email: user.email!,
        name: name ?? emailPrefix,
        username: finalUsername,
        role: 'user',
        hasCompletedOnboarding: false,
        gender,
        ageRange,
        pronouns,
        countryCode,
        languageCode,
        demographicsUpdatedAt: gender || ageRange || pronouns ? new Date() : undefined,
      },
    });
    return { created: true, needsOnboarding: true };
  }

  // User existant : on propage les champs profil s'ils ont été renseignés.
  const demographicPatch: Record<string, unknown> = {};
  if (gender || ageRange || pronouns || countryCode || languageCode) {
    if (gender) demographicPatch.gender = gender;
    if (ageRange) demographicPatch.ageRange = ageRange;
    if (pronouns) demographicPatch.pronouns = pronouns;
    if (countryCode) demographicPatch.countryCode = countryCode;
    if (languageCode) demographicPatch.languageCode = languageCode;
    demographicPatch.demographicsUpdatedAt = new Date();
  }
  if (Object.keys(demographicPatch).length > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: demographicPatch,
    });
  }

  return {
    created: false,
    needsOnboarding: existing.role === 'user' && !existing.hasCompletedOnboarding,
  };
}
