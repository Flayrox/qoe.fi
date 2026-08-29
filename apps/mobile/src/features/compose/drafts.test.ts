import { describe, it, expect, beforeEach } from 'vitest';
import { saveDraft, getDraft, listDrafts, deleteDraft, clearDrafts } from './drafts';

describe('drafts store', () => {
  beforeEach(() => {
    clearDrafts();
  });

  it('sauvegarde et relit un brouillon', () => {
    const d = saveDraft({ text: 'mon brouillon', parentId: 'parent-1' });
    expect(d.id).toBe('parent-1');
    expect(typeof d.updatedAt).toBe('number');
    expect(getDraft('parent-1')?.text).toBe('mon brouillon');
  });

  it('un brouillon vide est purgé au get', () => {
    saveDraft({ text: '   ', repostId: 'r1' });
    expect(getDraft('r1')).toBeUndefined();
  });

  it('retourne undefined sur id inconnu', () => {
    expect(getDraft('nope')).toBeUndefined();
  });

  it('liste triée de la plus récente (updatedAt) à la plus ancienne', () => {
    saveDraft({ text: 'a', parentId: 'p-a' });
    const t0 = Date.now() + 10_000;
    // Force une updatedAt plus ancienne pour simuler l'ordre.
    (saveDraft({ text: 'b', parentId: 'p-b' }) as any).updatedAt = t0 - 1000;
    (saveDraft({ text: 'c', parentId: 'p-c' }) as any).updatedAt = t0 - 2000;
    const ids = listDrafts().map((d) => d.id);
    expect(ids).toContain('p-a');
    expect(ids).toContain('p-b');
    expect(ids).toContain('p-c');
  });

  it('supprime un brouillon précis', () => {
    saveDraft({ text: 'x', parentId: 'p1' });
    deleteDraft('p1');
    expect(getDraft('p1')).toBeUndefined();
  });
});
