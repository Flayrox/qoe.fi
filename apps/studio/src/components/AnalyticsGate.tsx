import { cookies } from 'next/headers';
import { AnalyticsScript } from '@qoe/analytics/client';
import { COOKIE_CONSENT_COOKIE, parseConsentCookie } from '@qoe/utils/cookie-consent';

// =====================================================================
// 📊 AnalyticsGate — « aucun traceur non essentiel avant consentement »
// =====================================================================
// Le script de mesure d'audience est monté uniquement si le cookie de
// consentement (relu ici, côté serveur) l'autorise. Un visiteur qui n'a
// pas encore choisi, ou qui a refusé, ne télécharge rien : la promesse
// de la politique de cookies est tenue au niveau du rendu, pas seulement
// par du JavaScript côté client.
// =====================================================================

export async function AnalyticsGate() {
  const store = await cookies();
  const consent = parseConsentCookie(store.get(COOKIE_CONSENT_COOKIE)?.value);
  if (!consent?.analytics) return null;

  return <AnalyticsScript />;
}
