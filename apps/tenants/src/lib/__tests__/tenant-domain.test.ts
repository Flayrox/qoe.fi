import { describe, expect, it } from 'vitest';
import { normalizeTenantDomain } from '../tenant-domain';

describe('normalizeTenantDomain', () => {
  it('met l’hôte en minuscules : le DNS est insensible à la casse', () => {
    expect(normalizeTenantDomain('MEDIA.Qoe.FI')).toBe('media.qoe.fi');
  });

  it('décode un hôte percent-encodé, une seule fois', () => {
    expect(normalizeTenantDomain('media%2Eqoe%2Efi')).toBe('media.qoe.fi');
    // Encodé deux fois : on ne décode qu'une fois, et la casse est abaissée
    // avant, donc l'échappement restant est en minuscules.
    expect(normalizeTenantDomain('media%252Eqoe.fi')).toBe('media%2eqoe.fi');
  });

  it('retire le point racine d’un FQDN', () => {
    expect(normalizeTenantDomain('media.qoe.fi.')).toBe('media.qoe.fi');
  });

  it('ne lève pas sur un pourcentage isolé', () => {
    expect(() => decodeURIComponent('100%-qoe')).toThrow();
    expect(normalizeTenantDomain('100%-qoe')).toBe('100%-qoe');
  });

  it('traite une valeur absente comme vide', () => {
    expect(normalizeTenantDomain('')).toBe('');
    expect(normalizeTenantDomain(null)).toBe('');
    expect(normalizeTenantDomain(undefined)).toBe('');
  });
});
