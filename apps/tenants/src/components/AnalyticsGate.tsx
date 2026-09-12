import { cookies } from 'next/headers';
import { AnalyticsScript } from '@qoe/analytics/client';
import { COOKIE_CONSENT_COOKIE, analyticsAllowed, analyticsMode } from '@qoe/utils/cookie-consent';

// =====================================================================
// 📊 AnalyticsGate — la mesure d'audience n'est plus soumise à consentement
// =====================================================================
// Le blog d'un créateur embarque la même mesure d'audience anonyme que le site
// principal : sans cookie, IP anonymisée avant stockage, statistiques agrégées.
// Elle est dispensée de consentement pour tous les domaines hébergés — c'est la
// même garantie technique, donc la même dispense, quel que soit le locataire.
//
// Seule une opposition explicite du visiteur coupe le script, et elle est
// relue ici côté serveur : rien n'est téléchargé dans ce cas.
// =====================================================================

export async function AnalyticsGate({
  websiteId,
  fallbackId,
}: {
  websiteId?: string | null;
  fallbackId?: string | null;
}) {
  const mode = analyticsMode();
  const store = await cookies();
  const raw = store.get(COOKIE_CONSENT_COOKIE)?.value;
  if (!analyticsAllowed(raw, mode)) return null;

  const target = websiteId || fallbackId || undefined;
  return <AnalyticsScript websiteId={target ?? undefined} exempt={mode === 'exempt'} />;
}
