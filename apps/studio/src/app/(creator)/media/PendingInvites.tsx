'use client';

// =====================================================================
// 📥 Invitations média en attente — apps/studio/src/app/(creator)/media
// =====================================================================
// Une invitation ne donne aucun droit tant qu'elle n'est pas acceptée avec
// une session vérifiée. La bannière reste une seule surface : les invitations
// sont des lignes, pas des cartes dans la carte.
// =====================================================================

import { useEffect, useState } from 'react';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import { Button } from '@qoe/ui/button';
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
        toast.success(t`Invitation acceptée.`);
        setInvites((prev) => (prev ?? []).filter((i) => i.mediaId !== mediaId));
      }
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="rounded-xl bg-highlight/5 p-4">
      <div className="flex items-center gap-2">
        <MailOpen className="size-4 text-highlight" />
        <h3 className="text-sm font-medium text-foreground">
          {t`Invitations en attente`} ({invites.length})
        </h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t`Ces médias vous attendent : l'acceptation active votre rôle (une vérification renforcée peut être demandée).`}
      </p>

      <div className="mt-3 divide-y divide-border/40">
        {invites.map((invite) => (
          <div
            key={invite.mediaId}
            className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{invite.mediaName}</p>
              <p className="text-xs text-muted-foreground">{t`Rôle proposé : ${invite.role}`}</p>
            </div>
            <Button
              variant="solid"
              tone="brand"
              size="xs"
              disabled={acceptingId !== null}
              onClick={() => void accept(invite.mediaId)}
            >
              {acceptingId === invite.mediaId ? <Loader2 className="animate-spin" /> : null}
              {t`Accepter`}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
