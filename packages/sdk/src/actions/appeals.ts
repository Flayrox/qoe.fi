'use server';

// =====================================================================
// ⚖️ actions/appeals — recours lecteur contre les mesures visant son compte
// =====================================================================
// L'ouverture ne lève jamais rien : seule une décision staff overturned
// lève (verdict allow). Y compris suspendu (l'auth n'exclut pas les
// suspendus — contester reste possible). Un seul recours ouvert par sujet
// (le backend refuse les doublons en 409).
// =====================================================================

import { goFetch } from './utils/go-client';
import { safeAction } from './utils/safe-action';

export interface AppealMessageDTO {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface AppealDTO {
  id: string;
  subjectType: string;
  subjectId: string;
  decisionId: string | null;
  openedBy: string;
  status: 'open' | 'under_review' | 'decided';
  outcome: 'upheld' | 'overturned' | null;
  staffNote: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  messages?: AppealMessageDTO[];
}

/** Mes dossiers de recours (les miens uniquement). */
export const listMyAppealsAction = safeAction<
  { limit?: number; offset?: number },
  { items: AppealDTO[]; total: number }
>(async ({ limit, offset } = {}) => {
  const qs = `?limit=${limit ?? 20}&offset=${offset ?? 0}`;
  return goFetch<{ items: AppealDTO[]; total: number }>(`/v1/appeals${qs}`);
});

/** Un de mes dossiers, avec ses messages. */
export const getMyAppealAction = safeAction<string, { appeal: AppealDTO }>(async (appealId) => {
  const appeal = await goFetch<AppealDTO>(`/v1/appeals/${encodeURIComponent(appealId)}`);
  return { appeal };
});

/** Contester une mesure visant mon compte (sujet user:<moi>). */
export const openAppealAction = safeAction<
  { subjectId: string; message: string },
  { appeal: AppealDTO }
>(async ({ subjectId, message }) => {
  const appeal = await goFetch<AppealDTO>('/v1/appeals', {
    method: 'POST',
    body: { subjectType: 'user', subjectId, message },
  });
  return { appeal };
});

/** Écrire à mon dossier (clos = refusé : nouveau recours pour rouvrir). */
export const addAppealMessageAction = safeAction<
  { appealId: string; body: string },
  { appeal: AppealDTO }
>(async ({ appealId, body }) => {
  const appeal = await goFetch<AppealDTO>(`/v1/appeals/${encodeURIComponent(appealId)}/messages`, {
    method: 'POST',
    body: { body },
  });
  return { appeal };
});
