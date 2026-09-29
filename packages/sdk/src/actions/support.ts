'use server';

// =====================================================================
// 🎫 actions/support — dossiers du support général côté lecteur
// =====================================================================
// Un dossier ouvert par motif (le backend refuse les doublons en 409) :
// un autre problème du même type s'écrit DANS le dossier ouvert.
// L'ouverture ne change rien (ni suspension levée, ni permission accordée).
// =====================================================================

import { goFetch } from './utils/go-client';
import { safeAction } from './utils/safe-action';
import type { SupportKind, SupportStatus } from '../abuse-codes.generated';

export interface SupportMessageDTO {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface SupportTicketDTO {
  id: string;
  kind: SupportKind;
  subject: string;
  openedBy: string;
  status: SupportStatus;
  assignee: string | null;
  relatedType: string;
  relatedId: string;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  messages?: SupportMessageDTO[];
}

/** Mes dossiers (les miens uniquement). */
export const listMySupportTicketsAction = safeAction<
  { limit?: number; offset?: number },
  { items: SupportTicketDTO[]; total: number }
>(async ({ limit, offset } = {}) => {
  const qs = `?limit=${limit ?? 20}&offset=${offset ?? 0}`;
  return goFetch<{ items: SupportTicketDTO[]; total: number }>(`/v1/support/tickets${qs}`);
});

/** Un de mes dossiers, avec ses messages. */
export const getMySupportTicketAction = safeAction<string, { ticket: SupportTicketDTO }>(
  async (ticketId) => {
    const ticket = await goFetch<SupportTicketDTO>(
      `/v1/support/tickets/${encodeURIComponent(ticketId)}`
    );
    return { ticket };
  }
);

/** Ouvrir un dossier (un par motif — sinon écrire dans l'ouvert). */
export const openSupportTicketAction = safeAction<
  { kind: string; subject: string; message: string },
  { ticket: SupportTicketDTO }
>(async ({ kind, subject, message }) => {
  const ticket = await goFetch<SupportTicketDTO>('/v1/support/tickets', {
    method: 'POST',
    body: { kind, subject, message },
  });
  return { ticket };
});

/** Écrire à mon dossier (clos = refusé : nouveau dossier pour rouvrir). */
export const addSupportMessageAction = safeAction<
  { ticketId: string; body: string },
  { ticket: SupportTicketDTO }
>(async ({ ticketId, body }) => {
  const ticket = await goFetch<SupportTicketDTO>(
    `/v1/support/tickets/${encodeURIComponent(ticketId)}/messages`,
    { method: 'POST', body: { body } }
  );
  return { ticket };
});
