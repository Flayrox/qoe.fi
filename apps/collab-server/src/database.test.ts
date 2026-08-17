import { describe, it, expect } from 'vitest';
import { MemoryDatabase } from './database';

describe('MemoryDatabase (fallback sans Postgres)', () => {
  it('retourne undefined pour un document inconnu', async () => {
    const db = new MemoryDatabase();
    await expect(db.findDocument('article:inconnu')).resolves.toBeUndefined();
  });

  it('stocke, relit et remplace l’état d’un document', async () => {
    const db = new MemoryDatabase();
    const v1 = new Uint8Array([1, 2, 3]);
    const v2 = new Uint8Array([4, 5, 6]);

    await db.storeDocument('article:abc', v1);
    await expect(db.findDocument('article:abc')).resolves.toEqual(v1);

    await db.updateDocument('article:abc', v2);
    await expect(db.findDocument('article:abc')).resolves.toEqual(v2);
  });

  it('supprime un document', async () => {
    const db = new MemoryDatabase();
    await db.storeDocument('article:abc', new Uint8Array([1]));
    await db.deleteDocument('article:abc');
    await expect(db.findDocument('article:abc')).resolves.toBeUndefined();
  });
});
