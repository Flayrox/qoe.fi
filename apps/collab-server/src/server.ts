// =====================================================================
// 🧵 Factory du serveur Hocuspocus — réutilisable (prod + tests)
// =====================================================================
// `index.ts` assemble la config (env) puis délègue ici. Les tests
// d'intégration instancient la même factory avec une base mémoire et un
// verifier factice pour vérifier la synchro Yjs de bout en bout.
// =====================================================================

import { Server as HocuspocusServer } from '@hocuspocus/server';
import * as Y from 'yjs';
import type { CollabDatabase } from './database';
import type { TokenVerifier } from './auth';

export interface CollabServerOptions {
  /** Persistance des documents Yjs. */
  database: CollabDatabase;
  /** Validation du JWT (introspection Supabase en prod). */
  verifier: TokenVerifier;
  /** Taille maximale d'un document (octets). */
  maxDocumentBytes: number;
  /** Nom de l'instance (visible dans les logs Hocuspocus). */
  name?: string;
}

export type CollabServer = ReturnType<typeof HocuspocusServer.configure>;

export function createCollabServer(options: CollabServerOptions): CollabServer {
  const { database, verifier, maxDocumentBytes, name = 'qoe-collab' } = options;

  return HocuspocusServer.configure({
    name,

    // Authentification de chaque connexion WebSocket.
    async onAuthenticate({ token, documentName }) {
      const user = await verifier.verify(token ?? '');
      if (!user) {
        console.warn(`[collab-server] Connexion refusée (token invalide) : ${documentName}`);
        throw new Error('Non authentifié : token Supabase invalide ou expiré.');
      }
      return { name: user.name };
    },

    // Chargement du document avant la connexion : on applique l'état persisté
    // au Y.Doc déjà créé par Hocuspocus. Sans état, on reste vide ; le premier
    // éditeur "seede" avec le contenu de l'article (côté client, après le
    // premier sync) puis Hocuspocus persiste via onStoreDocument.
    async onLoadDocument({ documentName, document }) {
      const stored = await database.findDocument(documentName);
      if (stored && stored.byteLength > 0) {
        Y.applyUpdate(document, stored);
      }
    },

    // Persistance de l'état complet après chaque update (batch par défaut).
    async onStoreDocument({ documentName, document, clientsCount }) {
      const state = Y.encodeStateAsUpdate(document);
      if (state.byteLength > maxDocumentBytes) {
        console.warn(
          `[collab-server] Document ${documentName} refusé : ${state.byteLength} octets > ` +
            `${maxDocumentBytes}`
        );
        return;
      }
      await database.updateDocument(documentName, state);

      // Nettoyage : document vidé par le dernier éditeur → on libère la ligne.
      if (state.byteLength === 0 && clientsCount === 0) {
        await database.deleteDocument(documentName);
      }
    },
  });
}
