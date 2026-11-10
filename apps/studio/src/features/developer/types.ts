export type DeveloperAccessStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'revoked';

export interface DeveloperAccess {
  status: DeveloperAccessStatus;
  grants: string[];
  reason: string | null;
  updatedAt: string | null;
}

export interface DeveloperApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface DeveloperWorkspace {
  type: 'PERSONAL' | 'MEDIA';
  name: string;
  mediaId?: string | null;
  publisherId: string;
}

export type DeveloperCapabilityKey =
  'api:read' | 'api:write' | 'api:analytics' | 'webhooks' | 'oauth';

export const DEVELOPER_CAPABILITIES: Array<{
  key: DeveloperCapabilityKey;
  label: string;
  description: string;
}> = [
  {
    key: 'api:read',
    label: 'Lecture',
    description: 'Articles, profils publics et taxonomies.',
  },
  {
    key: 'api:write',
    label: 'Écriture',
    description: 'Création, modification et publication de contenus.',
  },
  {
    key: 'api:analytics',
    label: 'Analytics',
    description: 'Métriques de lecture et temps de complétion.',
  },
  {
    key: 'webhooks',
    label: 'Webhooks',
    description: 'Événements sortants signés en HMAC SHA-256.',
  },
  {
    key: 'oauth',
    label: 'OAuth',
    description: 'Applications OAuth 2.1 / OpenID Connect.',
  },
];

export function hasDeveloperGrant(access: DeveloperAccess, key: DeveloperCapabilityKey): boolean {
  return access.status === 'approved' && access.grants.includes(key);
}

export function developerWorkspaceAccess(workspace: DeveloperWorkspace): DeveloperAccess {
  if (workspace.type === 'MEDIA') {
    return {
      status: 'approved',
      grants: DEVELOPER_CAPABILITIES.map((capability) => capability.key),
      reason: null,
      updatedAt: null,
    };
  }

  return {
    status: 'none',
    grants: [],
    reason: null,
    updatedAt: null,
  };
}
