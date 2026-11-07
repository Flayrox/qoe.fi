'use client';

import { NotificationList } from '@qoe/ui/notifications';
import { acceptFollowRequestAction, rejectFollowRequestAction } from '../settings/actions';

/**
 * Centre de notifications reader : la liste générique reste dans @qoe/ui,
 * les actions de demande d'abonnement sont branchées ici pour garder le
 * package UI indépendant des server actions de l'app.
 */
export function NotificationsCenter() {
  return (
    <NotificationList
      onFollowRequestDecision={async (requestId, decision) => {
        if (decision === 'accept') {
          await acceptFollowRequestAction(requestId);
          return;
        }
        await rejectFollowRequestAction(requestId);
      }}
    />
  );
}
