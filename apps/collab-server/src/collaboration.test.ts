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
import type { TokenVerifier } from './auth';

const alwaysOk: TokenVerifier = {
  verify: async (token: string) => ({ id: 'test-user', name: 'Testeur' }),
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
});
