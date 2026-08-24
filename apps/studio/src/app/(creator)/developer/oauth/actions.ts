'use server';

// =====================================================================
// 🔐 Applications OAuth — apps/studio/src/app/(creator)/developer/oauth/actions.ts
// =====================================================================
// Le backend Go (apps/api) est l'autorité OAuth : ces server actions sont de
// fins proxies vers /v1/oauth/clients, authentifiés par le JWT Supabase de la
// session courante (via goFetch).
// =====================================================================

import { createClient } from '@qoe/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export interface OAuthClientDTO {
  id: string;
  clientId: string;
  name: string;
  description: string;
  logoUrl: string;
  homepageUrl: string;
  redirectUris: string[];
  scopes: string[];
  clientType: 'CONFIDENTIAL' | 'PUBLIC';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  hasSecret: boolean;
  createdAt: string;
}

export type OAuthActionOk<T> = { success: true } & T;
export type OAuthActionErr = { success: false; error: string };

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');
  return user;
}

/** 📋 Liste les applications OAuth de l'utilisateur (GET /v1/oauth/clients). */
export async function listOAuthClientsAction(): Promise<
  OAuthActionOk<{ clients: OAuthClientDTO[] }> | OAuthActionErr
> {
  try {
    await getAuthenticatedUser();
    const res = await goFetch<{ clients: OAuthClientDTO[] }>('/v1/oauth/clients');
    return { success: true, clients: res.clients ?? [] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur serveur',
    };
  }
}

/** ➕ Crée une application OAuth (POST /v1/oauth/clients). */
export async function createOAuthClientAction(input: {
  name: string;
  description?: string;
  logoUrl?: string;
  homepageUrl?: string;
  redirectUris: string[];
  scopes: string[];
  clientType: 'CONFIDENTIAL' | 'PUBLIC';
}): Promise<OAuthActionOk<{ clientId: string; clientSecret?: string }> | OAuthActionErr> {
  try {
    const user = await getAuthenticatedUser();
    const workspace = await getActiveWorkspace(user.id);

    const res = await goFetch<{ clientId: string; clientSecret?: string }>('/v1/oauth/clients', {
      method: 'POST',
      body: {
        name: input.name,
        description: input.description ?? '',
        logoUrl: input.logoUrl ?? '',
        homepageUrl: input.homepageUrl ?? '',
        redirectUris: input.redirectUris,
        scopes: input.scopes,
        clientType: input.clientType,
        publicationId: workspace.publicationId,
      },
    });
    revalidatePath('/developer/oauth');
    return { success: true, clientId: res.clientId, clientSecret: res.clientSecret };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur serveur',
    };
  }
}

/** 🔄 Régénère le secret d'une application confidentielle. */
export async function rotateOAuthClientSecretAction(
  id: string
): Promise<OAuthActionOk<{ clientSecret: string }> | OAuthActionErr> {
  try {
    await getAuthenticatedUser();
    const res = await goFetch<{ clientSecret: string }>(
      `/v1/oauth/clients/${encodeURIComponent(id)}/rotate-secret`,
      { method: 'POST' }
    );
    revalidatePath('/developer/oauth');
    return { success: true, clientSecret: res.clientSecret };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur serveur',
    };
  }
}

/** 🗑️ Révoque (supprime) une application OAuth et tous ses tokens. */
export async function deleteOAuthClientAction(
  id: string
): Promise<{ success: true } | OAuthActionErr> {
  try {
    await getAuthenticatedUser();
    await goFetch(`/v1/oauth/clients/${encodeURIComponent(id)}`, { method: 'DELETE' });
    revalidatePath('/developer/oauth');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur serveur',
    };
  }
}
