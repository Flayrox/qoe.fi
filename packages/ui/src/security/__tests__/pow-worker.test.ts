import { describe, expect, it } from 'vitest';
import { solvePowChallenge, type PowChallenge, type PowSolution } from '../index';

async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('solvePowChallenge', () => {
  it('résout un défi SHA-256 valide et retourne un payload JSON encodé en base64', async () => {
    const salt = 'qoe-salt-abc';
    const secretNumber = 42;
    const challengeHash = await sha256Hex(`${salt}${secretNumber}`);

    const challenge: PowChallenge = {
      algorithm: 'SHA-256',
      challenge: challengeHash,
      salt,
      maxNumber: 100,
      expiresAt: 1_800_000_000,
      signature: 'sig-hmac-hex',
    };

    const encoded = await solvePowChallenge(challenge);
    const decoded = JSON.parse(atob(encoded)) as PowSolution;

    expect(decoded).toEqual({
      algorithm: 'SHA-256',
      challenge: challengeHash,
      salt,
      number: secretNumber,
      expiresAt: 1_800_000_000,
      signature: 'sig-hmac-hex',
    });
  });

  it('gère le cas limite number = 0 et la casse du hash cible', async () => {
    const salt = 'zero-salt:';
    const challengeHash = (await sha256Hex(`${salt}0`)).toUpperCase();

    const encoded = await solvePowChallenge({
      algorithm: 'SHA-256',
      challenge: challengeHash,
      salt,
      maxNumber: 0,
      expiresAt: 1_800_000_001,
      signature: 'sig-0',
    });

    const decoded = JSON.parse(atob(encoded)) as PowSolution;
    expect(decoded.number).toBe(0);
    expect(decoded.challenge).toBe(challengeHash);
  });

  it('échoue si aucune solution n’existe dans 0..maxNumber', async () => {
    const challengeHash = await sha256Hex('salt:999');

    await expect(
      solvePowChallenge({
        algorithm: 'SHA-256',
        challenge: challengeHash,
        salt: 'salt:',
        maxNumber: 10,
        expiresAt: 1_800_000_000,
        signature: 'sig',
      })
    ).rejects.toThrow(/maxNumber/);
  });

  it('rejette un algorithme non supporté', async () => {
    await expect(
      solvePowChallenge({
        algorithm: 'SHA-512',
        challenge: 'abcd',
        salt: 's',
        maxNumber: 10,
        expiresAt: 1_800_000_000,
        signature: 'sig',
      })
    ).rejects.toThrow(/Algorithme PoW non supporté/);
  });
});
