import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type {
  DeveloperAccess,
  DeveloperAccessStatus,
  DeveloperApiKey,
  DeveloperWorkspace,
} from './types';

const KNOWN_STATUSES: DeveloperAccessStatus[] = [
  'none',
  'pending',
  'approved',
  'rejected',
  'revoked',
];

function normalizeStatus(value: string | null | undefined): DeveloperAccessStatus {
  const status = (value ?? 'none').toLowerCase();
  return KNOWN_STATUSES.includes(status as DeveloperAccessStatus)
    ? (status as DeveloperAccessStatus)
    : 'none';
}

export async function getDeveloperAccess(): Promise<DeveloperAccess> {
  try {
    const me = await goFetch<{
      data: {
        apiAccessStatus?: string;
        apiGrants?: string[];
        apiApplicationReason?: string | null;
        updatedAt?: string | null;
      };
    }>('/v1/users/me');

    return {
      status: normalizeStatus(me.data?.apiAccessStatus),
      grants: me.data?.apiGrants ?? [],
      reason: me.data?.apiApplicationReason ?? null,
      // `updatedAt` est la seule date exposée par /v1/users/me. Elle correspond
      // à la dernière transition du dossier (demande, décision, révocation).
      updatedAt: me.data?.updatedAt ?? null,
    };
  } catch (err) {
    console.warn('[developer] impossible de lire le statut d’accès:', err);
    return { status: 'none', grants: [], reason: null, updatedAt: null };
  }
}

export async function getDeveloperKeys(workspace: DeveloperWorkspace): Promise<DeveloperApiKey[]> {
  try {
    if (workspace.type === 'MEDIA' && workspace.mediaId) {
      const res = await goFetch<{
        keys: Array<{
          id: string;
          name: string;
          keyPrefix: string;
          scopes?: string[];
          createdAt: string;
          lastUsedAt?: string | null;
        }>;
      }>(`/v1/media/${encodeURIComponent(workspace.mediaId)}/api-keys`);

      return (res.keys ?? []).map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes ?? [],
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt ?? null,
      }));
    }

    const res = await goFetch<{ keys: DeveloperApiKey[] }>('/v1/settings/api-keys');
    return res.keys ?? [];
  } catch (err) {
    console.warn('[developer] impossible de lire les clés API:', err);
    return [];
  }
}
