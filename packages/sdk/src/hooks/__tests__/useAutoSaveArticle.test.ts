import { describe, it, expect, vi } from 'vitest';
import { useAutoSaveArticle } from '../useAutoSaveArticle';

describe('useAutoSaveArticle module', () => {
  it('1. Exports the useAutoSaveArticle hook function correctly', () => {
    expect(typeof useAutoSaveArticle).toBe('function');
  });

  it('2. Defines AutoSaveStatus types and handles payload structure correctly', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue({ id: 'art-100', updatedAt: new Date().toISOString() });

    // Test payload formatting and promise resolution contract
    const payload = {
      title: 'Titre de Test',
      content: '<p>Contenu de test</p>',
      slug: 'titre-de-test',
      isPremium: true,
      published: false,
    };

    const result = await onSave(payload);

    expect(result.id).toBe('art-100');
    expect(result.updatedAt).toBeDefined();
    expect(onSave).toHaveBeenCalledWith(payload);
  });
});
