// =====================================================================
// admin-security-data — lecture du cockpit Sécurité & Trust (Lot 5)
// =====================================================================
// Agrège la vue 30 jours du noyau anti-abus (PolicyV3), l'état du flag
// authz-enforce et les compteurs actifs de shadowban / suspension.
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { readOr, type Read } from './read-result';

export interface PolicyV3RuleStat {
  rule: string;
  reason: string;
  count: number;
}

export interface SecurityTopSubject {
  subjectType: string;
  subjectId: string;
  signals: number;
  lastResult: string;
}

export interface SecurityAbuseMetrics {
  since: string;
  autoByResult: Record<string, number>;
  autoByReason: Record<string, number>;
  humanReviews: number;
  humanDismissed: number;
  humanByResult: Record<string, number>;
  dismissalRate: number;
  openQueue: number;
  topSubjects: SecurityTopSubject[];
}

export interface SecurityOverview {
  metrics: SecurityAbuseMetrics;
  policyV3: PolicyV3RuleStat[];
  /** `null` = la sonde n'a rien dit : ni armé ni en observation. */
  authzEnforceEnabled: boolean | null;
  shadowbannedCount: number;
  suspendedCount: number;
}

export interface TrustRecomputeResult {
  userId: string;
  score: number;
  tier: string;
  accountAgeDays: number;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  effectiveFollowers: number;
  subnetAccountCount: number;
  reasons: string[];
}

/**
 * Traduit le mode d'application Authz pour l'affichage.
 *
 * Trois états, pas deux : `null` (sonde muette) ne s'affiche ni comme armé ni
 * comme « observation » — c'est « illisible », et l'écran le dit.
 */
export function describeAuthzEnforcement(mode: boolean | null): {
  value: string;
  tone: 'default' | 'warn';
  detail: string;
} {
  if (mode === null) {
    return {
      value: '—',
      tone: 'default',
      detail: 'mode d’application Authz illisible',
    };
  }
  return mode
    ? { value: 'enforce', tone: 'default', detail: 'refus armés' }
    : { value: 'observe', tone: 'warn', detail: 'observation seule' };
}

/** Charge l'instantané Sécurité & Trust sur 30 jours depuis l'API Go. */
export async function getSecurityOverview(): Promise<Read<SecurityOverview>> {
  return readOr('le cockpit sécurité', fetchSecurityOverview);
}

async function fetchSecurityOverview(): Promise<SecurityOverview> {
  const body = await goFetch<Partial<SecurityOverview>>('/v1/admin/security/overview');
  const rawMetrics = body?.metrics;
  return {
    metrics: {
      since: typeof rawMetrics?.since === 'string' ? rawMetrics.since : '',
      autoByResult:
        rawMetrics?.autoByResult && typeof rawMetrics.autoByResult === 'object'
          ? rawMetrics.autoByResult
          : {},
      autoByReason:
        rawMetrics?.autoByReason && typeof rawMetrics.autoByReason === 'object'
          ? rawMetrics.autoByReason
          : {},
      humanReviews: typeof rawMetrics?.humanReviews === 'number' ? rawMetrics.humanReviews : 0,
      humanDismissed:
        typeof rawMetrics?.humanDismissed === 'number' ? rawMetrics.humanDismissed : 0,
      humanByResult:
        rawMetrics?.humanByResult && typeof rawMetrics.humanByResult === 'object'
          ? rawMetrics.humanByResult
          : {},
      dismissalRate: typeof rawMetrics?.dismissalRate === 'number' ? rawMetrics.dismissalRate : -1,
      openQueue: typeof rawMetrics?.openQueue === 'number' ? rawMetrics.openQueue : 0,
      topSubjects: Array.isArray(rawMetrics?.topSubjects) ? rawMetrics.topSubjects : [],
    },
    policyV3: Array.isArray(body?.policyV3) ? body.policyV3 : [],
    // `Boolean(undefined)` valait `false` : l'écran affirmait « observe »
    // sur une réponse muette. Seules les deux valeurs lues comptent.
    authzEnforceEnabled:
      typeof body?.authzEnforceEnabled === 'boolean' ? body.authzEnforceEnabled : null,
    shadowbannedCount: typeof body?.shadowbannedCount === 'number' ? body.shadowbannedCount : 0,
    suspendedCount: typeof body?.suspendedCount === 'number' ? body.suspendedCount : 0,
  };
}
