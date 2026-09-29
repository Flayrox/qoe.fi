import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_OFFLINE_PACKS,
  OFFLINE_PREFIX,
  hasOfflinePack,
  listOfflinePacks,
  offlinePackKey,
  purgeOfflinePacks,
  readOfflinePack,
  removeOfflinePack,
  saveOfflinePack,
  type OfflineStorage,
} from './offline-store';

// Faux Storage (Map) — la logique du magasin ne touche jamais au DOM.
function fakeStorage(options: { failWrite?: () => boolean } = {}) {
  const map = new Map<string, string>();
  const storage: OfflineStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (options.failWrite?.()) throw new DOMException('quota', 'QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
    get length() {
      return map.size;
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
  return { storage, map };
}

const pack = (title: string) => ({
  version: 1,
  kind: 'ebook',
  payload: { title, chapters: [{ title: 'C1', html: '<p>x</p>' }] },
});

describe('offline-store', () => {
  let ctx: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    ctx = fakeStorage();
  });

  it('enregistre puis relit un pack (aller-retour intact)', () => {
    expect(saveOfflinePack(ctx.storage, 'book-1', pack('Livre'))).toBe(true);
    const read = readOfflinePack<{ title: string }>(ctx.storage, 'book-1');
    expect(read?.payload.title).toBe('Livre');
    expect(read?.kind).toBe('ebook');
    expect(read?.version).toBe(1);
    expect(hasOfflinePack(ctx.storage, 'book-1')).toBe(true);
  });

  it('remplace un pack existant sans compter double', () => {
    saveOfflinePack(ctx.storage, 'book-1', pack('v1'));
    saveOfflinePack(ctx.storage, 'book-1', pack('v2'));
    expect(listOfflinePacks(ctx.storage)).toHaveLength(1);
    expect(readOfflinePack<{ title: string }>(ctx.storage, 'book-1')?.payload.title).toBe('v2');
  });

  it('supprime et vide uniquement NOS clés', () => {
    ctx.storage.setItem('autre.module', 'à garder');
    saveOfflinePack(ctx.storage, 'book-1', pack('A'));
    saveOfflinePack(ctx.storage, 'book-2', pack('B'));
    removeOfflinePack(ctx.storage, 'book-1');
    expect(hasOfflinePack(ctx.storage, 'book-1')).toBe(false);
    expect(listOfflinePacks(ctx.storage)).toHaveLength(1);
    purgeOfflinePacks(ctx.storage);
    expect(listOfflinePacks(ctx.storage)).toHaveLength(0);
    expect(ctx.storage.getItem('autre.module')).toBe('à garder');
  });

  it('évince le plus ancien au-delà de la limite douce', () => {
    for (let i = 0; i < MAX_OFFLINE_PACKS; i++) {
      saveOfflinePack(
        ctx.storage,
        `b${i}`,
        pack(`L${i}`),
        new Date(2026, 0, 1 + i) // ordre d'ancienneté déterministe
      );
    }
    expect(listOfflinePacks(ctx.storage)).toHaveLength(MAX_OFFLINE_PACKS);
    expect(hasOfflinePack(ctx.storage, 'b0')).toBe(true);

    saveOfflinePack(ctx.storage, 'new', pack('N'), new Date(2027, 0, 1));
    const infos = listOfflinePacks(ctx.storage);
    expect(infos).toHaveLength(MAX_OFFLINE_PACKS);
    expect(infos.some((p) => p.id === 'b0')).toBe(false); // le plus ancien parti
    expect(infos[0].id).toBe('new'); // plus récent en tête
  });

  it('nettoie une entrée corrompue au lieu de replanter', () => {
    ctx.storage.setItem(offlinePackKey('casse'), '{ pas du json');
    expect(readOfflinePack(ctx.storage, 'casse')).toBeNull();
    expect(ctx.storage.getItem(offlinePackKey('casse'))).toBeNull();

    // …et ignore une entrée valide en JSON mais sans la forme attendue.
    ctx.storage.setItem(offlinePackKey('forme'), JSON.stringify({ hello: 'world' }));
    expect(readOfflinePack(ctx.storage, 'forme')).toBeNull();
    expect(listOfflinePacks(ctx.storage)).toHaveLength(0);
  });

  it('quota plein : évince puis réessaie, et dit la vérité si ça échoue encore', () => {
    // Le stockage refuse tant qu'il reste des packs à évincer.
    ctx = fakeStorage({ failWrite: () => ctx.map.size > 0 });
    saveOfflinePack(ctx.storage, 'book-1', pack('A'), new Date(2026, 0, 1));
    // Impossible d'écrire ici : le premier pack est là depuis toujours.
    expect(saveOfflinePack(ctx.storage, 'book-2', pack('B'))).toBe(true);
    expect(hasOfflinePack(ctx.storage, 'book-1')).toBe(false); // évincé
    expect(hasOfflinePack(ctx.storage, 'book-2')).toBe(true);

    // Stockage qui refuse TOUT : on renvoie false (jamais un faux succès).
    const always = fakeStorage({ failWrite: () => true });
    expect(saveOfflinePack(always.storage, 'book-3', pack('C'))).toBe(false);
    expect(hasOfflinePack(always.storage, 'book-3')).toBe(false);
  });

  it('expose une clé préfixée (noms stables, pas de collision)', () => {
    expect(offlinePackKey('abc')).toBe(`${OFFLINE_PREFIX}abc`);
  });

  it('gère les appels asynchrones avec repli gracieux sans environnement DOM/IDB', async () => {
    const {
      hasOfflinePackAsync,
      readOfflinePackAsync,
      saveOfflinePackAsync,
      removeOfflinePackAsync,
      listOfflinePacksAsync,
    } = await import('./offline-store');

    // Hors navigateur / sans storage, les méthodes asynchrones se replient élégamment sans planter
    expect(await hasOfflinePackAsync('test-book')).toBe(false);
    expect(await readOfflinePackAsync('test-book')).toBeNull();
    expect(await listOfflinePacksAsync()).toEqual([]);

    // Enregistrement gracieux : renvoie false si aucun stockage n'est accessible
    expect(await saveOfflinePackAsync('test-book', pack('Test'))).toBe(false);
    await expect(removeOfflinePackAsync('test-book')).resolves.toBeUndefined();
  });
});
