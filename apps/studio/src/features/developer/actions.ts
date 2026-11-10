'use server';

import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { getDeveloperKeys } from './server';
import type { DeveloperApiKey, DeveloperWorkspace } from './types';

/**
 * Relit les clés depuis la même source que la page après une création.
 *
 * Le secret renvoyé par `generateApiKeyAction` ne contient pas l'identifiant
 * de la clé : sans cette relecture, le client ne pouvait construire qu'un
 * identifiant temporaire et la révocation échouait.
 */
export async function listDeveloperKeysAction(): Promise<
  { success: true; keys: DeveloperApiKey[] } | { success: false; error: string }
> {
  const user = await requireUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  const workspace = await getActiveWorkspace(user.id);
  const workspaceContext: DeveloperWorkspace = {
    type: workspace.type,
    name: workspace.name,
    mediaId: workspace.mediaId,
    publisherId: workspace.publisherId,
  };

  return { success: true, keys: await getDeveloperKeys(workspaceContext) };
}
