// =====================================================================
// admin-security-data — lecture du cockpit Sécurité & Trust (Lot 5)
// =====================================================================
// Agrège la vue 30 jours du noyau anti-abus (PolicyV3), l'état du flag
// authz-enforce et les compteurs actifs de shadowban / suspension.
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';

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
  authzEnforceEnabled: boolean;
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

const EMPTY_OVERVIEW: SecurityOverview = {
  metrics: {
    since: '',
    autoByResult: {},
    autoByReason: {},
    humanReviews: 0,
    humanDismissed: 0,
    humanByResult: {},
    dismissalRate: -1,
    openQueue: 0,
    topSubjects: [],
  },
  policyV3: [],
  authzEnforceEnabled: false,
  shadowbannedCount: 0,
  suspendedCount: 0,
};

/** Charge l'instantané Sécurité & Trust sur 30 jours depuis l'API Go. */
export async function getSecurityOverview(): Promise<SecurityOverview> {
  try {
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
        dismissalRate:
          typeof rawMetrics?.dismissalRate === 'number' ? rawMetrics.dismissalRate : -1,
        openQueue: typeof rawMetrics?.openQueue === 'number' ? rawMetrics.openQueue : 0,
        topSubjects: Array.isArray(rawMetrics?.topSubjects) ? rawMetrics.topSubjects : [],
      },
      policyV3: Array.isArray(body?.policyV3) ? body.policyV3 : [],
      authzEnforceEnabled: Boolean(body?.authzEnforceEnabled),
      shadowbannedCount: typeof body?.shadowbannedCount === 'number' ? body.shadowbannedCount : 0,
      suspendedCount: typeof body?.suspendedCount === 'number' ? body.suspendedCount : 0,
    };
  } catch {
    return EMPTY_OVERVIEW;
  }
}
