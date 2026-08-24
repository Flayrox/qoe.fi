import { describe, it, expect } from 'vitest';
import { isUnauthorizedError } from '../utils/authError';

describe('isUnauthorizedError — détection d’expiration de session', () => {
  it('renvoie false pour null / undefined', () => {
    expect(isUnauthorizedError(null)).toBe(false);
    expect(isUnauthorizedError(undefined)).toBe(false);
  });

  it('détecte le statut HTTP 401 (status ou statusCode)', () => {
    expect(isUnauthorizedError({ status: 401 })).toBe(true);
    expect(isUnauthorizedError({ statusCode: 401 })).toBe(true);
    expect(isUnauthorizedError({ status: 403 })).toBe(false);
  });

  it('détecte les messages d’erreur standardisés', () => {
    expect(isUnauthorizedError({ message: 'UNAUTHORIZED' })).toBe(true);
    expect(isUnauthorizedError({ code: 'UNAUTHORIZED' })).toBe(true);
    expect(isUnauthorizedError({ message: 'Non autorisé' })).toBe(true);
    expect(isUnauthorizedError({ message: 'Unauthorized access' })).toBe(true);
  });

  it('détecte une chaîne brute contenant 401', () => {
    expect(isUnauthorizedError('HTTP 401: token expired')).toBe(true);
    expect(isUnauthorizedError('erreur réseau')).toBe(false);
  });

  it('ne confond pas une erreur métier avec une expiration de session', () => {
    expect(isUnauthorizedError({ message: 'Article introuvable', status: 404 })).toBe(false);
    expect(isUnauthorizedError({ message: 'Forbidden' })).toBe(false);
  });
});
