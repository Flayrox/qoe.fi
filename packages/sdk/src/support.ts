import type { SupportKind } from './abuse-codes.generated';

// Libellés par kind (lot 4) : Record typé — un kind Go sans libellé casse
// tsc, une faute de frappe aussi.
export const SUPPORT_KINDS_LABELS: Record<SupportKind, string> = {
  account_restricted: 'Compte restreint',
  account_lost: 'Compte perdu / MFA',
  content_moderation: 'Contenu modéré',
  api_access: 'Accès API',
  import_issue: 'Import',
  delivery: 'Livraison e-mails',
  report_issue: 'Signalement',
  other: 'Autre',
};

export const SUPPORT_KINDS = (Object.keys(SUPPORT_KINDS_LABELS) as SupportKind[]).map((id) => ({
  id,
  label: SUPPORT_KINDS_LABELS[id],
}));
