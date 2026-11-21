// =====================================================================
// 🧪 Intégration : synchro Yjs de bout en bout (2 éditeurs réels)
// =====================================================================
// Démarre un vrai serveur Hocuspocus (base mémoire + verifier factice),
// connecte deux HocuspocusProvider sur le même document et vérifie que :
//   1. le texte tapé par l'éditeur A arrive chez l'éditeur B ;
//   2. l'état est persisté (storeDocument) ;
//   3. un nouvel arrivant reçoit l'état persisté (onLoadDocument).
// =====================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { createCollabServer, type CollabServer } from './server';
import { MemoryDatabase } from './database';
import { CollabGuard } from './guard';
import type { TokenVerifier } from './auth';

const alwaysOk: TokenVerifier = {
  verify: async () => ({ id: 'test-user', name: 'Testeur' }),
};

// Port éphémère déterministe pour éviter les collisions avec d'autres tests.
const PORT = 12987;
const DOC_NAME = 'article:test-e2e';

let server: CollabServer;
let database: MemoryDatabase;

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = fn();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timeout en attendant une condition');
}

describe('Collaboration Hocuspocus (bout en bout)', () => {
  beforeAll(async () => {
    database = new MemoryDatabase();
    server = createCollabServer({
      database,
      verifier: alwaysOk,
      maxDocumentBytes: 1024 * 1024,
      name: 'test-collab',
    });
    await server.listen(PORT);
  });

  afterAll(async () => {
    await server.destroy();
  });

  it('synchronise le texte entre deux éditeurs et persiste l’état', async () => {
    // ── Éditeur A : écrit dans un Y.Text ─────────────────────────────
    const docA = new Y.Doc();
    const providerA = new HocuspocusProvider({
      url: `ws://127.0.0.1:${PORT}`,
      name: DOC_NAME,
      document: docA,
      token: 'token-a',
    });
    await waitFor(() => (providerA.isSynced ? true : undefined));

    const textA = docA.getText('body');
    textA.insert(0, 'Bonjour la collaboration !');

    // ── Éditeur B : doit recevoir le texte ───────────────────────────
    const docB = new Y.Doc();
    const providerB = new HocuspocusProvider({
      url: `ws://127.0.0.1:${PORT}`,
      name: DOC_NAME,
      document: docB,
      token: 'token-b',
    });

    await waitFor(() => {
      const text = docB.getText('body').toString();
      return text.includes('Bonjour') ? text : undefined;
    });
    expect(docB.getText('body').toString()).toContain('collaboration');

    // ── Persistance : l'état a été stocké en base ────────────────────
    await waitFor(async () => {
      const stored = await database.findDocument(DOC_NAME);
      return stored && stored.byteLength > 0 ? stored : undefined;
    });

    // ── Éditeur C : un nouvel arrivant récupère l'état persisté ──────
    const docC = new Y.Doc();
    const providerC = new HocuspocusProvider({
      url: `ws://127.0.0.1:${PORT}`,
      name: DOC_NAME,
      document: docC,
      token: 'token-c',
    });
    await waitFor(() => {
      const text = docC.getText('body').toString();
      return text.includes('Bonjour') ? text : undefined;
    });
    expect(docC.getText('body').toString()).toBe('Bonjour la collaboration !');

    // ── A : la modification de B remonte aussi chez A (bidirectionnel) ──
    textA.insert(textA.toString().length, ' (et retour !)');
    await waitFor(() => {
      const text = docC.getText('body').toString();
      return text.includes('retour') ? text : undefined;
    });

    providerA.destroy();
    providerB.destroy();
    providerC.destroy();
  });

  it('refuse les connexions avec un token invalide', async () => {
    const badServer = createCollabServer({
      database: new MemoryDatabase(),
      verifier: {
        verify: async () => null,
      },
      maxDocumentBytes: 1024 * 1024,
      name: 'test-collab-bad',
    });
    const badPort = PORT + 1;
    await badServer.listen(badPort);

    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: `ws://127.0.0.1:${badPort}`,
      name: 'article:secret',
      document: doc,
      token: 'token-invalide',
    });

    // Le WebSocket s'ouvre (couche transport) mais l'auth est rejetée côté
    // serveur : aucune donnée ne doit être échangée sur le document.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(doc.getText('body').toString()).toBe('');

    provider.destroy();
    await badServer.destroy();
  });

  it('bloque un intrus sur un document déjà chargé en mémoire (RBAC par connexion)', async () => {
    const rbacServer = createCollabServer({
      database: new MemoryDatabase(),
      verifier: {
        verify: async (token) => {
          if (token === 'token-a') return { id: 'author-a', name: 'Alice' };
          if (token === 'token-b') return { id: 'intruder-b', name: 'Intrus' };
          return null;
        },
      },
      canEditDocument: async (userId) => userId === 'author-a',
      maxDocumentBytes: 1024 * 1024,
      name: 'test-collab-rbac',
    });
    const rbacPort = PORT + 2;
    await rbacServer.listen(rbacPort);

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const providerA = new HocuspocusProvider({
      url: `ws://127.0.0.1:${rbacPort}`,
      name: 'article:prive',
      document: docA,
      token: 'token-a',
    });
    let providerB: HocuspocusProvider | undefined;

    try {
      await waitFor(() => (providerA.isSynced ? true : undefined));
      docA.getText('body').insert(0, 'Secret éditorial');
      await new Promise((resolve) => setTimeout(resolve, 150));

      providerB = new HocuspocusProvider({
        url: `ws://127.0.0.1:${rbacPort}`,
        name: 'article:prive',
        document: docB,
        token: 'token-b',
      });
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(docB.getText('body').toString()).toBe('');

      docB.getText('body').insert(0, 'PIRATÉ');
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(docA.getText('body').toString()).toBe('Secret éditorial');
    } finally {
      providerA.destroy();
      providerB?.destroy();
      await rbacServer.destroy();
    }
  });

  it('ne fuite pas de slot CollabGuard quand canEditDocument refuse l’accès', async () => {
    const guard = new CollabGuard({ maxConnsPerUser: 1, maxConnsPerIP: 10 });
    const guardServer = createCollabServer({
      database: new MemoryDatabase(),
      verifier: {
        verify: async () => ({ id: 'user-limited', name: 'Limité' }),
      },
      canEditDocument: async (_userId, docName) => docName === 'article:autorise',
      guard,
      maxDocumentBytes: 1024 * 1024,
      name: 'test-collab-guard-slot',
    });
    const guardPort = PORT + 3;
    await guardServer.listen(guardPort);

    const docDenied = new Y.Doc();
    const providerDenied = new HocuspocusProvider({
      url: `ws://127.0.0.1:${guardPort}`,
      name: 'article:interdit',
      document: docDenied,
      token: 'token-limited',
    });
    let providerOk: HocuspocusProvider | undefined;

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(providerDenied.isSynced).toBe(false);

      const docOk = new Y.Doc();
      providerOk = new HocuspocusProvider({
        url: `ws://127.0.0.1:${guardPort}`,
        name: 'article:autorise',
        document: docOk,
        token: 'token-limited',
      });

      await waitFor(() => (providerOk?.isSynced ? true : undefined));
      expect(providerOk.isSynced).toBe(true);
    } finally {
      providerDenied.destroy();
      providerOk?.destroy();
      await guardServer.destroy();
    }
  });
});
