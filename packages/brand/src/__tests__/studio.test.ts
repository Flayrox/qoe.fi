import { describe, it, expect } from 'vitest';
import { STUDIO_ENTITIES } from '../studio';

describe('STUDIO_ENTITIES registry', () => {
  it('contient les catégories principales d’analytics, audience, developer et publishing', () => {
    const keys = Object.keys(STUDIO_ENTITIES);
    expect(keys).toContain('views');
    expect(keys).toContain('subscribers');
    expect(keys).toContain('apiKeys');
    expect(keys).toContain('articles');
  });

  it('chaque métrique possède une icône Lucide suggérée et un label', () => {
    Object.values(STUDIO_ENTITIES).forEach((entity) => {
      expect(entity.label.length).toBeGreaterThan(0);
      expect(entity.suggestedLucideIcon.length).toBeGreaterThan(0);
      expect(['analytics', 'audience', 'developer', 'publishing']).toContain(entity.category);
    });
  });
});
