'use server';

// =====================================================================
// 🏖️ admin-sandbox-actions — Scénarios d'essai & Impersonation (Lot D6)
// =====================================================================
// Permet de générer des jeux de données d'essai isolés et d'endosser un
// compte utilisateur avec audit inconditionnel et step-up N2.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { authzTrailers } from '@/lib/action-result';
import { assertCapability } from '@/lib/admin-identity';

export interface SandboxScenarioInfo {
  id: string;
  title: string;
  description: string;
  targetFile: string;
  entities: string[];
}

export interface SeedScenarioResult {
  success: boolean;
  scenario: string;
  generatedCount: number;
  message: string;
  entities: Record<string, unknown>;
}

export interface ImpersonateResult {
  userId: string;
  email: string;
  name: string;
  role: string;
  readerUrl: string;
  message: string;
  impersonated: boolean;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** 📋 Récupère la liste des scénarios de simulation disponibles. */
export async function getSandboxScenariosAction(): Promise<SandboxScenarioInfo[]> {
  await assertCapability('admin.dashboard.read');
  try {
    const data = await goFetch<{ scenarios: SandboxScenarioInfo[] }>(
      '/v1/admin/sandbox/scenarios'
    );
    return data.scenarios ?? [];
  } catch {
    return [];
  }
}

/** ⚡ Exécute un scénario de seed prédéfini dans la base de données. */
export async function executeSeedScenarioAction(
  scenario: string,
  count = 1
): Promise<
  | { success: true; result: SeedScenarioResult }
  | { success: false; error: string; challengeToken?: string; challengeFactor?: string }
> {
  await assertCapability('admin.config.write');

  try {
    const result = await goFetch<SeedScenarioResult>('/v1/admin/sandbox/seed', {
      method: 'POST',
      body: { scenario, count },
    });

    revalidatePath('/admin/sandbox');
    revalidatePath('/admin/work');
    revalidatePath('/admin/users');
    revalidatePath('/admin/notifications');
    revalidatePath('/admin/compliance');

    return { success: true, result };
  } catch (error: unknown) {
    console.error('executeSeedScenarioAction error:', error);
    return {
      success: false,
      error: errorMessage(error, 'Exécution du scénario impossible'),
      ...authzTrailers(error),
    };
  }
}

/** 🎭 Prépare et audite la prise d'identité (impersonation) d'un compte. */
export async function impersonateUserAction(
  email: string,
  reason: string
): Promise<
  | { success: true; result: ImpersonateResult }
  | { success: false; error: string; challengeToken?: string; challengeFactor?: string }
> {
  await assertCapability('admin.config.write');

  const trimmedEmail = email.trim();
  const trimmedReason = reason.trim();

  if (!trimmedEmail) {
    return { success: false, error: 'L’adresse email du compte à endosser est obligatoire.' };
  }
  if (!trimmedReason) {
    return { success: false, error: 'Un motif d’audit ou de test est strictement obligatoire.' };
  }

  try {
    const result = await goFetch<ImpersonateResult>('/v1/admin/sandbox/impersonate', {
      method: 'POST',
      body: { email: trimmedEmail, reason: trimmedReason },
    });

    revalidatePath('/admin/sandbox');
    revalidatePath('/admin/audit');

    return { success: true, result };
  } catch (error: unknown) {
    console.error('impersonateUserAction error:', error);
    return {
      success: false,
      error: errorMessage(error, 'Prise d’identité impossible'),
      ...authzTrailers(error),
    };
  }
}
