// =====================================================================
// 🔐 Écran de consentement OAuth — apps/core/src/app/oauth/authorize/page.tsx
// =====================================================================
// Front du endpoint d'autorisation OAuth 2.1 / OIDC. Reçoit la requête du
// RP (third-party), valide via l'API Go et affiche le consentement.
// =====================================================================

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@qoe/auth';
import {
  beginOAuthAuthorizationAction,
  oauthAuthorizeParamsToQuery,
  type OAuthAuthorizeParams,
} from './actions';
import { OAuthConsentClient } from './consent-client';

export const dynamic = 'force-dynamic';

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const params: OAuthAuthorizeParams = {
    responseType: readParam(sp.response_type),
    clientId: readParam(sp.client_id),
    redirectUri: readParam(sp.redirect_uri),
    scope: readParam(sp.scope),
    state: readParam(sp.state),
    nonce: readParam(sp.nonce),
    codeChallenge: readParam(sp.code_challenge),
    codeChallengeMethod: readParam(sp.code_challenge_method),
  };

  // L'utilisateur doit être connecté avant de consentir.
  const user = await getCurrentUser();
  if (!user) {
    const backTo = `/oauth/authorize?${await oauthAuthorizeParamsToQuery(params)}`;
    redirect(`/login?redirect=${encodeURIComponent(backTo)}`);
  }

  const result = await beginOAuthAuthorizationAction(params);

  // Erreur "redirigeable" (ex. invalid_scope) → on renvoie l'erreur au RP.
  if (!result.ok && result.redirect) {
    redirect(result.redirect);
  }

  // Erreur non-redirigeable (ex. invalid_client) → écran d'erreur.
  if (!result.ok || !result.info) {
    return (
      <OAuthConsentClient
        error={{
          code: result.error ?? 'invalid_request',
          description: result.errorDescription ?? 'Requête d’autorisation invalide.',
        }}
        info={null}
        params={params}
      />
    );
  }

  return <OAuthConsentClient info={result.info} params={params} error={null} />;
}
