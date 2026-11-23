// =====================================================================
// 🧪 status-display — un statut inconnu n'est jamais « En attente »
// =====================================================================
// Le défaut mesuré (R166) : `STATUS_META[c.status] ?? STATUS_META.PENDING`
// présentait toute valeur non prévue comme une demande à traiter, et la
// console proposait même « Activer l'accès API » sur un statut qu'elle
// n'affichait pas. Ces tests figent la résolution et les décisions permises.
// =====================================================================

import { describe, expect, it } from 'vitest';
import {
  API_ACCESS_STATUSES,
  OAUTH_APP_STATUSES,
  apiAccessActions,
  oauthAppActions,
  resolveApiAccessStatus,
  resolveOAuthAppStatus,
} from '../status-display';

describe('resolveOAuthAppStatus', () => {
  it('reconnaît les quatre statuts du backend', () => {
    for (const status of OAUTH_APP_STATUSES) {
      expect(resolveOAuthAppStatus(status)).toBe(status);
    }
  });

  it('ne confond pas une valeur inconnue avec une demande en attente', () => {
    expect(resolveOAuthAppStatus('SUSPENDED')).toBe('UNKNOWN');
    expect(resolveOAuthAppStatus('')).toBe('UNKNOWN');
    expect(resolveOAuthAppStatus(null)).toBe('UNKNOWN');
    expect(resolveOAuthAppStatus(undefined)).toBe('UNKNOWN');
  });

  it('tolère les espaces autour de la valeur sans avaler la casse', () => {
    expect(resolveOAuthAppStatus(' APPROVED ')).toBe('APPROVED');
    expect(resolveOAuthAppStatus('approved')).toBe('UNKNOWN');
  });
});

describe('resolveApiAccessStatus', () => {
  it('reconnaît les cinq statuts du backend', () => {
    for (const status of API_ACCESS_STATUSES) {
      expect(resolveApiAccessStatus(status)).toBe(status);
    }
  });

  it('marque inconnu tout le reste', () => {
    expect(resolveApiAccessStatus('suspended')).toBe('UNKNOWN');
    expect(resolveApiAccessStatus('PENDING')).toBe('UNKNOWN');
    expect(resolveApiAccessStatus(undefined)).toBe('UNKNOWN');
  });
});

describe('décisions offertes', () => {
  it('n’offre aucune action sur un statut inconnu', () => {
    expect(oauthAppActions('UNKNOWN')).toEqual([]);
    expect(apiAccessActions('UNKNOWN')).toEqual([]);
  });

  it('garde les transitions légitimes des statuts connus', () => {
    expect(oauthAppActions('PENDING')).toEqual(['APPROVED', 'REJECTED']);
    expect(oauthAppActions('REJECTED')).toEqual(['APPROVED']);
    expect(oauthAppActions('REVOKED')).toEqual(['APPROVED']);
    expect(oauthAppActions('APPROVED')).toEqual(['REVOKED']);

    expect(apiAccessActions('pending')).toEqual(['approve', 'reject']);
    expect(apiAccessActions('approved')).toEqual(['revoke']);
    expect(apiAccessActions('none')).toEqual(['approve']);
    expect(apiAccessActions('rejected')).toEqual(['approve']);
    expect(apiAccessActions('revoked')).toEqual(['approve']);
  });
});
