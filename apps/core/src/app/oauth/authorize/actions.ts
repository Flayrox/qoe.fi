'use server';

// =====================================================================
// 🔐 Écran de consentement OAuth — apps/core/src/app/oauth/authorize/actions.ts
// =====================================================================
// La page de consentement (apps/core) est le front du endpoint d'autorisation.
// Elle appelle l'API Go (autorité OAuth) via goFetch, authentifiée par le JWT
// Supabase de l'utilisateur connecté.
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export interface OAuthAuthorizeParams {
  responseType: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

export interface OAuthScopeInfo {
  name: string;
  description: string;
  required: boolean;
}

export interface OAuthClientInfo {
  id: string;
  clientId: string;
  name: string;
  description: string;
  logoUrl: string;
  homepageUrl: string;
}

export interface OAuthAuthorizeInfo {
  client: OAuthClientInfo;
  scopes: OAuthScopeInfo[];
  state: string;
  alreadyConsented: boolean;
}

export interface OAuthAuthorizeResult {
  ok: boolean;
  info?: OAuthAuthorizeInfo;
  error?: string;
  errorDescription?: string;
  redirect?: string;
}

function toQueryString(params: OAuthAuthorizeParams): string {
  const q = new URLSearchParams();
  if (params.responseType) q.set('response_type', params.responseType);
  if (params.clientId) q.set('client_id', params.clientId);
  if (params.redirectUri) q.set('redirect_uri', params.redirectUri);
  if (params.scope) q.set('scope', params.scope);
  if (params.state) q.set('state', params.state);
  if (params.nonce) q.set('nonce', params.nonce);
  if (params.codeChallenge) q.set('code_challenge', params.codeChallenge);
  if (params.codeChallengeMethod) q.set('code_challenge_method', params.codeChallengeMethod);
  return q.toString();
}

export async function oauthAuthorizeParamsToQuery(params: OAuthAuthorizeParams): Promise<string> {
  return toQueryString(params);
}

/** 🔎 Valide la requête et récupère l'écran de consentement (GET /v1/oauth/authorize). */
export async function beginOAuthAuthorizationAction(
  params: OAuthAuthorizeParams
): Promise<OAuthAuthorizeResult> {
  try {
    const res = await goFetch<OAuthAuthorizeResult>(`/v1/oauth/authorize?${toQueryString(params)}`);
    return res;
  } catch (err) {
    return {
      ok: false,
      error: 'server_error',
      errorDescription:
        err instanceof Error ? err.message : 'Le service d’autorisation est indisponible.',
    };
  }
}

/** ✅/❌ Décision de l'utilisateur (POST /v1/oauth/authorize) → URL de redirection. */
export async function decideOAuthAuthorizationAction(
  params: OAuthAuthorizeParams,
  decision: 'approve' | 'deny',
  remember: boolean
): Promise<OAuthAuthorizeResult> {
  try {
    const res = await goFetch<OAuthAuthorizeResult>('/v1/oauth/authorize', {
      method: 'POST',
      body: { ...params, decision, remember },
    });
    return res;
  } catch (err) {
    return {
      ok: false,
      error: 'server_error',
      errorDescription:
        err instanceof Error ? err.message : 'Le service d’autorisation est indisponible.',
    };
  }
}
