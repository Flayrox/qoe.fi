import { describe, it, expect } from 'vitest';
import { BRAND_LOGOS, BRAND_BADGES, BRAND_AVATAR_FALLBACKS, BRAND_SOCIAL_ICONS } from '../paths';

describe('BRAND_LOGOS', () => {
  it('contient le symbole Q avec son viewBox et ratio valide', () => {
    expect(BRAND_LOGOS.symbol.viewBox).toBe('0 0 216 133');
    expect(BRAND_LOGOS.symbol.defaultColor).toBe('#EE4B2B');
    expect(BRAND_LOGOS.symbol.aspectRatio).toBeCloseTo(1.624, 2);
    expect(BRAND_LOGOS.symbol.path).toContain('M4.2096');
  });

  it('contient le wordmark complet avec son viewBox et ratio valide', () => {
    expect(BRAND_LOGOS.wordmark.viewBox).toBe('540 596 1416 548');
    expect(BRAND_LOGOS.wordmark.aspectRatio).toBeCloseTo(2.585, 2);
    expect(BRAND_LOGOS.wordmark.path).toContain('1708.581');
  });
});

describe('BRAND_BADGES', () => {
  it('contient le badge certifié avec sa géométrie officielle vermillon', () => {
    expect(BRAND_BADGES.certified.viewBox).toBe('0 0 14 14');
    expect(BRAND_BADGES.certified.bgCircle.color).toBe('#EE4B2B');
    expect(BRAND_BADGES.certified.checkColor).toBe('#FFFFFF');
    expect(BRAND_BADGES.certified.checkPath).toBe('M4.2 7.2L5.9 8.9L9.8 5');
  });

  it('contient le badge média avec sa géométrie squircle', () => {
    expect(BRAND_BADGES.media.viewBox).toBe('0 0 14 14');
    expect(BRAND_BADGES.media.bgRect.rx).toBe(4);
    expect(BRAND_BADGES.media.iconColor).toBe('#FFFFFF');
  });
});

describe('BRAND_AVATAR_FALLBACKS', () => {
  it('contient les silhouettes humaines et média valides', () => {
    expect(BRAND_AVATAR_FALLBACKS.userSilhouette.viewBox).toBe('0 0 24 24');
    expect(BRAND_AVATAR_FALLBACKS.userSilhouette.headCircle.cx).toBe(12);
    expect(BRAND_AVATAR_FALLBACKS.mediaEmblem.paths.length).toBeGreaterThan(0);
  });
});

describe('BRAND_SOCIAL_ICONS', () => {
  it('contient toutes les plateformes sociales majeures', () => {
    const platforms = [
      'x',
      'twitter',
      'github',
      'linkedin',
      'instagram',
      'youtube',
      'bluesky',
      'mastodon',
      'discord',
      'apple',
      'google',
      'rss',
    ];

    for (const platform of platforms) {
      const icon = BRAND_SOCIAL_ICONS[platform];
      expect(icon, `L'icône ${platform} doit être définie`).toBeDefined();
      expect(icon.viewBox).toBe('0 0 24 24');
      expect(icon.path.length).toBeGreaterThan(20);
    }
  });
});
