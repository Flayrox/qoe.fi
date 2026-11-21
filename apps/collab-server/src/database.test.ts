import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { MemoryDatabase, PostgresDatabase } from './database';

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

describe('PostgresDatabase (initialisation et erreurs pool)', () => {
  it('attache un écouteur error sur le pool et attend SCHEMA_SQL avant les requêtes', async () => {
    const order: string[] = [];
    let resolveSchema!: () => void;
    const schemaPending = new Promise<void>((resolve) => {
      resolveSchema = resolve;
    });

    const mockPool = {
      on: vi.fn(),
      query: vi.fn(async (sql: string) => {
        if (sql.includes('CREATE TABLE IF NOT EXISTS collab_documents')) {
          order.push('schema-start');
          await schemaPending;
          order.push('schema-done');
          return { rows: [] };
        }
        order.push('find');
        return { rows: [] };
      }),
      end: vi.fn(async () => {}),
    } as unknown as Pool;

    const PostgresCtor = PostgresDatabase as unknown as new (
      connectionString: string,
      poolSize?: number,
      pool?: Pool
    ) => PostgresDatabase;
    const db = new PostgresCtor('postgresql://unused', 5, mockPool);

    expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));

    const findPromise = db.findDocument('article:1');
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual(['schema-start']);

    resolveSchema();
    await findPromise;
    expect(order).toEqual(['schema-start', 'schema-done', 'find']);
  });
});
