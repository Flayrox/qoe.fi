'use client';

// =====================================================================
// 📥 Invitations média en attente — apps/studio/src/app/(creator)/media
// =====================================================================
// Depuis la fiche 05 §6, une invitation ne donne aucun droit tant qu'elle
// n'est pas acceptée avec une session fortement vérifiée. Ce composant liste
// les invitations du compte et propose l'activation : en cas de refus MFA,
// `attemptWithStepUp` ouvre la vérification puis rejoue l'acceptation, au
// lieu d'un 403 sans issue.
// =====================================================================

import { useEffect, useState } from 'react';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import { Loader2, MailOpen } from 'lucide-react';
import {
  acceptMediaInviteAction,
  listPendingMediaInvitesAction,
  type PendingMediaInvite,
} from './actions';
import { attemptWithStepUp } from '@/lib/authz-feedback';

export function PendingInvites() {
  const [invites, setInvites] = useState<PendingMediaInvite[] | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const load = async () => {
    const res = await listPendingMediaInvitesAction();
    if (res.success) setInvites(res.items);
    else setInvites([]);
  };

  useEffect(() => {
    void load();
  }, []);

  // Pas encore chargé, ou aucune invitation : rien à afficher (pas de bruit).
  if (!invites || invites.length === 0) return null;

  const accept = async (mediaId: string) => {
    setAcceptingId(mediaId);
    try {
      const res = await attemptWithStepUp(() => acceptMediaInviteAction(mediaId), {
        fallback: t`Échec de l'acceptation.`,
      });
      if (res.success) {
        toast.success(t`Bienvenue dans le Média !`);
        setInvites((prev) => (prev ?? []).filter((i) => i.mediaId !== mediaId));
      }
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-highlight/40 bg-highlight/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MailOpen className="w-4 h-4 text-highlight" />
        <h3 className="text-sm font-semibold">{t`Invitations en attente (${invites.length})`}</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {t`Ces médias vous attendent : l'acceptation active votre rôle (une vérification renforcée peut être demandée).`}
      </p>
      <div className="space-y-2">
        {invites.map((invite) => (
          <div
            key={invite.mediaId}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{invite.mediaName}</p>
              <p className="text-xs text-muted-foreground">{t`Rôle proposé : ${invite.role}`}</p>
            </div>
            <button
              type="button"
              disabled={acceptingId !== null}
              onClick={() => void accept(invite.mediaId)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {acceptingId === invite.mediaId && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t`Accepter`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
