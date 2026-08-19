import { describe, expect, it } from 'vitest';
import { EVENTS } from '../events';

describe('events catalog', () => {
  it('expose des noms d’événements uniques', () => {
    const values = Object.values(EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('tous les noms sont des chaînes non vides en snake_case', () => {
    for (const value of Object.values(EVENTS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
      expect(value).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('couvre les grandes familles métier (auth, onboarding, articles, posts, social, billing)', () => {
    const all = Object.values(EVENTS).join(' ');
    for (const family of [
      'signup_',
      'onboarding_',
      'article_',
      'post_',
      'user_',
      'subscription_',
    ]) {
      expect(all).toContain(family);
    }
  });
});
