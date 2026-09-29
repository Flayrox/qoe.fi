// =====================================================================
// ⚠️ GÉNÉRÉ — ne pas éditer (lot 4). Source : constantes Go
// (abuse.Decisions/ReasonCodes/IncidentKinds/... + support.Kinds/Statuses).
// Régénérer : depuis apps/api,
//   go run ./cmd/abuse-codes > ../../packages/sdk/src/abuse-codes.generated.ts
// Les maps de libellés se typent Record<Union, string> : tout écart
// Go↔TS casse tsc au lieu de diverger silencieusement.
// =====================================================================

export type AbuseDecision =
  | 'allow'
  | 'challenge'
  | 'limit_distribution'
  | 'needs_review'
  | 'pause_sending'
  | 'slow'
  | 'suspend';

export type AbuseReasonCode =
  | 'burst.signup.publication'
  | 'swarm.like.liker'
  | 'swarm.like.target'
  | 'swarm.report.reporter'
  | 'swarm.report.target';

export type AbuseIncidentKind =
  | 'account_farm'
  | 'api_abuse'
  | 'impersonation'
  | 'other'
  | 'report_raid'
  | 'signup_flood'
  | 'spam_wave';

export type AbuseIncidentStatus = 'contained' | 'open' | 'reopened' | 'resolved';

export type AbuseAppealStatus = 'decided' | 'open' | 'under_review';

export type AbuseAppealOutcome = 'overturned' | 'upheld';

export type SupportKind =
  | 'account_lost'
  | 'account_restricted'
  | 'api_access'
  | 'content_moderation'
  | 'delivery'
  | 'import_issue'
  | 'other'
  | 'report_issue';

export type SupportStatus = 'closed' | 'open' | 'under_review';
