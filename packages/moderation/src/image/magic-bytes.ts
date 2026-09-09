// =====================================================================
// 🔬 Magic Bytes — Validation Binaire Physique de Sécurité Médias
// =====================================================================
// Détecte le type MIME réel d'un fichier à partir de ses premiers octets.
// Prévient les attaques de type MIME-spoofing et fichiers polyglottes.
// =====================================================================

export interface MagicBytesResult {
  valid: boolean;
  mime: string;
  extension: string;
}

/**
 * 🔬 Détecte et valide le format réel d'un buffer ou Uint8Array.
 */
export function detectMagicBytes(bytes: Uint8Array | Buffer): MagicBytesResult {
  if (!bytes || bytes.length < 12) {
    return { valid: false, mime: '', extension: '' };
  }

  // 1. JPEG (FF D8 FF)
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, mime: 'image/jpeg', extension: 'jpg' };
  }

  // 2. PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { valid: true, mime: 'image/png', extension: 'png' };
  }

  // 3. WebP (RIFF .... WEBP)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { valid: true, mime: 'image/webp', extension: 'webp' };
  }

  // 4. GIF (GIF87a ou GIF89a)
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { valid: true, mime: 'image/gif', extension: 'gif' };
  }

  // 5. AVIF (....ftypavif ou ....ftypavis)
  const headerSlice = Array.from(bytes.slice(4, 12))
    .map((b) => String.fromCharCode(b))
    .join('');
  if (headerSlice.includes('ftypavif') || headerSlice.includes('ftypavis')) {
    return { valid: true, mime: 'image/avif', extension: 'avif' };
  }

  return { valid: false, mime: '', extension: '' };
}
