/**
 * Solveur Proof-of-Work (SHA-256) compatible navigateur (WebCrypto) et Node >= 20.
 * Correspond au format de défi émis par le backend Go (`internal/pow`).
 */

export interface PowChallenge {
  algorithm: string;
  challenge: string;
  salt: string;
  maxNumber: number;
  expiresAt: number;
  signature: string;
}

export interface PowSolution {
  algorithm: string;
  challenge: string;
  salt: string;
  number: number;
  expiresAt: number;
  signature: string;
}

const HEX_TABLE = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += HEX_TABLE[bytes[i]!];
  }
  return out;
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Résout un défi PoW en testant `0..maxNumber` jusqu'à trouver `SHA-256(salt + number) === challenge`.
 * Retourne le payload JSON `{ algorithm, challenge, salt, number, expiresAt, signature }` encodé en base64.
 */
export async function solvePowChallenge(challenge: PowChallenge): Promise<string> {
  if (challenge.algorithm !== 'SHA-256') {
    throw new Error(`Algorithme PoW non supporté : ${challenge.algorithm}`);
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto (crypto.subtle) indisponible dans cet environnement.');
  }

  if (!Number.isInteger(challenge.maxNumber) || challenge.maxNumber < 0) {
    throw new Error('Borne maxNumber invalide pour le défi PoW.');
  }

  const target = challenge.challenge.toLowerCase();
  const encoder = new TextEncoder();

  for (let n = 0; n <= challenge.maxNumber; n++) {
    const input = encoder.encode(`${challenge.salt}${n}`);
    const digest = await subtle.digest('SHA-256', input);
    if (bufferToHex(digest) === target) {
      const solution: PowSolution = {
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        salt: challenge.salt,
        number: n,
        expiresAt: challenge.expiresAt,
        signature: challenge.signature,
      };
      return encodeBase64Utf8(JSON.stringify(solution));
    }
  }

  throw new Error('Impossible de résoudre le défi PoW dans la limite maxNumber.');
}
