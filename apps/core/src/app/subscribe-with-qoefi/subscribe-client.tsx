'use client';

// =====================================================================
// 📨 Client « S'abonner avec qoe.fi » — confirmation explicite + résultat
// =====================================================================
// - Le clic sur le site tiers n'a jamais inscrit : c'est CE bouton qui
//   déclenche l'abonnement, pour la publication affichée uniquement.
// - Après succès/annulation : postMessage minimal ({ ok: true } /
//   { cancelled: true }) vers l'origine de `returnUrl` si la fenêtre a une
//   opener — jamais session, token ni email. Sans opener (repli redirection),
//   succès affiché + bouton de retour explicite (pas de redirect auto).
// =====================================================================

import { useState } from 'react';
import { subscribeWithQoeFiAction } from './actions';

interface Props {
  email: string;
  publicationSlug: string;
  publicationId: string | null;
  publicationName: string | null;
  returnUrl: string | null;
}

function returnOrigin(returnUrl: string | null): string | null {
  if (!returnUrl) return null;
  try {
    return new URL(returnUrl).origin;
  } catch {
    return null;
  }
}

export function SubscribeWithQoeFiClient({
  email,
  publicationSlug,
  publicationId,
  publicationName,
  returnUrl,
}: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState('');
  const [cancelled, setCancelled] = useState(false);

  const displayName = publicationName ?? publicationSlug;
  const hasOpener = typeof window !== 'undefined' && !!window.opener;

  const notify = (result: { ok: true } | { cancelled: true }) => {
    // Résultat minimal uniquement. L'origine cible est celle de l'URL de
    // retour validée côté serveur ; à défaut, '*' est inacceptable — on
    // n'émet rien (le bouton de retour explicite prend le relais).
    const origin = returnOrigin(returnUrl);
    if (!hasOpener || !origin) return;
    try {
      window.opener.postMessage(result, origin);
    } catch {
      // Opener déjà fermée : le résultat reste affiché ici.
    }
  };

  const confirm = async () => {
    if (!publicationId) {
      setStatus('error');
      setMessage('Publication introuvable. Revenez sur le site du créateur et réessayez.');
      return;
    }
    setStatus('loading');
    setMessage('');
    const res = await subscribeWithQoeFiAction({ email, publicationId });
    if (res.ok) {
      setStatus('done');
      setActive(!!res.active);
      notify({ ok: true });
    } else {
      setStatus('error');
      setMessage(res.error ?? 'Abonnement impossible pour le moment.');
    }
  };

  const cancel = () => {
    setCancelled(true);
    notify({ cancelled: true });
  };

  if (cancelled) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
        <h1 className="text-lg font-semibold">Abonnement annulé</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Rien n'a été inscrit. Vous pouvez fermer cette fenêtre.
        </p>
        {returnUrl && (
          <a
            href={returnUrl}
            className="mt-4 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
          >
            Retourner sur le site
          </a>
        )}
      </main>
    );
  }

  if (status === 'done') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
        <h1 className="text-lg font-semibold">
          {active ? 'Abonnement confirmé !' : 'Plus qu’une étape !'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {active ? (
            <>
              Vous recevrez la newsletter de {displayName} à {email}.
            </>
          ) : (
            <>
              Un lien vient de partir vers {email} — cliquez dessus pour activer l'abonnement à{' '}
              {displayName}.
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Vous pouvez fermer cette fenêtre
          {returnUrl ? ' ou retourner sur le site.' : '.'}
        </p>
        {returnUrl && (
          <a
            href={returnUrl}
            className="mt-4 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
          >
            Retourner sur le site
          </a>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">qoe.fi</p>
      <h1 className="mt-2 text-xl font-bold">Confirmer l'abonnement à {displayName} ?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Avec votre compte <span className="font-semibold text-foreground">{email}</span>.
        <br />
        Le site tiers ne recevra ni votre session, ni votre adresse — seulement le résultat.
      </p>
      {status === 'error' && <p className="mt-3 text-sm text-destructive">{message}</p>}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={status === 'loading'}
          className="rounded-xl bg-foreground px-6 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
        >
          {status === 'loading' ? 'Confirmation…' : "Oui, m'abonner"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={status === 'loading'}
          className="rounded-xl border border-border px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          Annuler
        </button>
      </div>
    </main>
  );
}
