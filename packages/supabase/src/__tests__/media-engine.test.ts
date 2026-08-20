// =====================================================================
// 🛡️ BANC DE TESTS UNITAIRES — MOTEUR DE MÉDIAS SÉCURISÉ (@qoe/supabase)
// =====================================================================

import { describe, it, expect } from 'vitest';
import {
  detectMagicBytes,
  sanitizeSvgBuffer,
  processAndSecureImage,
  moderateImageBuffer,
} from '../media-engine';
import sharp from 'sharp';

describe('🛡️ Media Engine — Détection Binaire Magic Bytes & Sécurité Anti-MIME Spoof', () => {
  it('détecte correctement une signature JPEG authentique', () => {
    const jpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const result = detectMagicBytes(jpegBuffer);
    expect(result.valid).toBe(true);
    expect(result.mime).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
  });

  it('détecte correctement une signature PNG authentique', () => {
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const result = detectMagicBytes(pngBuffer);
    expect(result.valid).toBe(true);
    expect(result.mime).toBe('image/png');
    expect(result.extension).toBe('png');
  });

  it('détecte correctement une signature WebP authentique', () => {
    const webpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    const result = detectMagicBytes(webpBuffer);
    expect(result.valid).toBe(true);
    expect(result.mime).toBe('image/webp');
    expect(result.extension).toBe('webp');
  });

  it('rejette immédiatement un script malveillant PHP ou exécutable se faisant passer pour une image', () => {
    const fakeImageBuffer = Buffer.from('<?php echo "evil code"; ?>', 'utf8');
    const result = detectMagicBytes(fakeImageBuffer);
    expect(result.valid).toBe(false);
    expect(result.mime).toBe('');
  });

  it('rejette un buffer trop court ou vide sans lever d’exception', () => {
    const emptyBuffer = Buffer.from([0x00, 0x01]);
    const result = detectMagicBytes(emptyBuffer);
    expect(result.valid).toBe(false);
  });
});

describe('🛡️ Media Engine — Sanitization SVG Anti-XSS', () => {
  it('nettoie et supprime toutes les balises <script> malveillantes dans un SVG', () => {
    const maliciousSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/><script>alert("xss")</script></svg>',
      'utf8'
    );
    const sanitized = sanitizeSvgBuffer(maliciousSvg);
    const text = sanitized.toString('utf8');
    expect(text).not.toContain('<script');
    expect(text).not.toContain('alert');
    expect(text).toContain('<rect');
  });

  it('supprime les attributs d’événements javascript inline (onload, onclick, href=javascript:)', () => {
    const maliciousSvg = Buffer.from(
      '<svg onload="alert(1)"><a href="javascript:steal()"><circle cx="50" cy="50" r="40"/></a></svg>',
      'utf8'
    );
    const sanitized = sanitizeSvgBuffer(maliciousSvg);
    const text = sanitized.toString('utf8');
    expect(text).not.toContain('onload=');
    expect(text).not.toContain('javascript:');
    expect(text).toContain('<circle');
  });
});

describe('🛡️ Media Engine — Pipeline Sharp, Stripping EXIF & Dédoublonnage CAS', () => {
  it('transforme une image brute en WebP optimisé et calcule le hash SHA-256 CAS', async () => {
    // Créer une image de test 100x100 valide en mémoire avec Sharp
    const testImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 66, g: 133, b: 244, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await processAndSecureImage(testImageBuffer, 'image/png');

    expect(result.mimeType).toBe('image/webp');
    expect(result.extension).toBe('webp');
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(result.sha256).toBeDefined();
    expect(result.sha256.length).toBe(64); // SHA-256 hex
    expect(result.blurhash).toContain('data:image/webp;base64,');
  });

  it('dédoublonne de façon cryptographique deux buffers identiques au même hash SHA-256', async () => {
    const testBuffer = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const result1 = await processAndSecureImage(testBuffer, 'image/png');
    const result2 = await processAndSecureImage(testBuffer, 'image/png');

    expect(result1.sha256).toBe(result2.sha256);
  });
});

describe('🛡️ Media Engine — Modération Multimodale (Mocking Safety Filter)', () => {
  it('passe avec succès en environnement dev lorsque la clé OpenAI est mockée', async () => {
    const sampleBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const mod = await moderateImageBuffer(sampleBuffer, 'image/jpeg');
    expect(mod.safe).toBe(true);
    expect(mod.isNsfw).toBe(false);
  });
});
