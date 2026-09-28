// =====================================================================
// 📨 Page « S'abonner avec qoe.fi » — apps/core/src/app/subscribe-with-qoefi
// =====================================================================
// Fenêtre qoe.fi ouverte par le bouton d'un site tiers (fiche 02 §3). C'est
// qoe.fi qui lit SA propre session ; le site tiers ne lit jamais les cookies
// qoe.fi et ne reçoit qu'un résultat minimal ({ ok } / { cancelled }).
//
// - Connecté : « Confirmer l'abonnement à [publication] ? » — le clic initial
//   sur le site tiers n'a jamais inscrit personne.
// - Non connecté : redirection login avec retour, ou repli vers le parcours
//   e-mail (le visiteur peut toujours s'abonner sans compte).
// - Popup bloquée / mobile : cette même URL sert de repli par redirection ;
//   le résultat revient alors par le bouton de retour explicite, jamais par
//   redirection automatique vers une URL non validée.
// =====================================================================

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@qoe/auth';
import { getSubscribePublicationProfile } from './actions';
import { SubscribeWithQoeFiClient } from './subscribe-client';

export const dynamic = 'force-dynamic';

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/**
 * URL de retour validée : http(s) uniquement, longueur bornée. Toute autre
 * valeur est ignorée — pas de redirection libre vers une URL arbitraire
 * (fiche 02 §7). Le retour se fait par bouton explicite ou postMessage vers
 * cette origine, jamais par redirection automatique aveugle.
 */
function cleanReturnUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.toString();
}

export default async function SubscribeWithQoeFiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const publication = readParam(sp.publication);
  const returnUrl = cleanReturnUrl(readParam(sp.return));

  if (!publication) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
        <h1 className="text-lg font-semibold">Lien d'abonnement incomplet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Il manque la publication concernée. Revenez sur le site du créateur et réessayez.
        </p>
      </main>
    );
  }

  const user = await getCurrentUser();
  if (!user?.email) {
    const backTo = `/subscribe-with-qoefi?publication=${encodeURIComponent(publication)}${
      returnUrl ? `&return=${encodeURIComponent(returnUrl)}` : ''
    }`;
    redirect(`/login?redirect=${encodeURIComponent(backTo)}`);
  }

  const profile = await getSubscribePublicationProfile(publication);

  return (
    <SubscribeWithQoeFiClient
      email={user.email}
      publicationSlug={publication}
      publicationId={profile?.id ?? null}
      publicationName={profile?.name ?? null}
      returnUrl={returnUrl}
    />
  );
}
