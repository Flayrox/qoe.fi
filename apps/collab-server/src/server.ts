// =====================================================================
// 🧵 Factory du serveur Hocuspocus — réutilisable (prod + tests)
// =====================================================================
// `index.ts` assemble la config (env) puis délègue ici. Les tests
// d'intégration instancient la même factory avec une base mémoire et un
// verifier factice pour vérifier la synchro Yjs de bout en bout.
// =====================================================================

import type { IncomingMessage } from 'node:http';
import { Server as HocuspocusServer } from '@hocuspocus/server';
import * as Y from 'yjs';
import type { CollabDatabase } from './database';
import type { TokenVerifier } from './auth';
import type { DocumentAccessChecker } from './permissions';
import { CollabGuard } from './guard';

export interface CollabServerOptions {
  /** Persistance des documents Yjs. */
  database: CollabDatabase;
  /** Validation du JWT (introspection Supabase en prod). */
  verifier: TokenVerifier;
  /** Taille maximale d'un document (octets). */
  maxDocumentBytes: number;
  /** Nom de l'instance (visible dans les logs Hocuspocus). */
  name?: string;
  /**
   * RBAC publication : contrôle qui peut éditer un document (`article:{id}`).
   * Absent en dev/tests → tout utilisateur authentifié peut éditer.
   */
  canEditDocument?: DocumentAccessChecker;
  /** Garde-fou anti-abus (connexions, débit, taille, brute-force auth). */
  guard?: CollabGuard;
}

interface CollabConnectionContext {
  name?: string;
  userId?: string;
  clientIp?: string;
  guardAcquired?: boolean;
}

function extractClientIp(request?: IncomingMessage): string {
  const forwardedFor = request?.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    const first = forwardedFor[0]?.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request?.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim().length > 0) {
    return realIp.trim();
  }
  return request?.socket?.remoteAddress ?? 'unknown';
}

function releaseGuardConnection(guard: CollabGuard, context: unknown): void {
  const ctx = context as CollabConnectionContext | undefined;
  if (ctx?.guardAcquired && ctx.userId && ctx.clientIp) {
    guard.releaseConnection(ctx.userId, ctx.clientIp);
    ctx.guardAcquired = false;
  }
}

export type CollabServer = ReturnType<typeof HocuspocusServer.configure>;

export function createCollabServer(options: CollabServerOptions): CollabServer {
  const { database, verifier, maxDocumentBytes, name = 'qoe-collab' } = options;
  const canEditDocument = options.canEditDocument;
  const guard = options.guard ?? new CollabGuard();

  return HocuspocusServer.configure({
    name,

    // Pré-contrôle à la connexion WebSocket (blocage IP brute-force).
    async onConnect({ request, documentName }) {
      const ip = extractClientIp(request);
      if (guard.isIPBlocked(ip)) {
        console.warn(`[collab-server] Connexion refusée (IP bloquée ${ip}) : ${documentName}`);
        throw new Error('Adresse IP temporairement bloquée.');
      }
      return { clientIp: ip };
    },

    // Authentification de chaque connexion WebSocket.
    async onAuthenticate({ token, documentName, request }) {
      const ip = extractClientIp(request);
      if (guard.isIPBlocked(ip)) {
        console.warn(`[collab-server] Auth refusée (IP bloquée ${ip}) : ${documentName}`);
        throw new Error('Adresse IP temporairement bloquée.');
      }

      const user = await verifier.verify(token ?? '');
      if (!user) {
        guard.recordAuthFailure(ip);
        console.warn(`[collab-server] Connexion refusée (token invalide) : ${documentName}`);
        throw new Error('Non authentifié : token Supabase invalide ou expiré.');
      }

      const connCheck = guard.acquireConnection(user.id, ip);
      if (!connCheck.allowed) {
        console.warn(
          `[collab-server] Connexion refusée (quota) : ${documentName} (user ${user.id}, ip ${ip})`
        );
        throw new Error(connCheck.reason ?? 'Plafond de connexions atteint.');
      }

      // userId/clientIp sont exposés dans le contexte des hooks suivants.
      return { name: user.name, userId: user.id, clientIp: ip, guardAcquired: true };
    },

    // Chargement du document avant la connexion : on applique l'état persisté
    // au Y.Doc déjà créé par Hocuspocus, APRÈS avoir vérifié le droit d'éditer.
    async onLoadDocument({ documentName, document, context }) {
      if (canEditDocument) {
        const userId = (context as CollabConnectionContext | undefined)?.userId;
        if (!userId) {
          releaseGuardConnection(guard, context);
          throw new Error('Contexte utilisateur manquant.');
        }
        const allowed = await canEditDocument(userId, documentName);
        if (!allowed) {
          releaseGuardConnection(guard, context);
          console.warn(
            `[collab-server] Accès refusé (pas éditeur) : ${documentName} (user ${userId})`
          );
          throw new Error("Vous n'avez pas le droit d'éditer cet article.");
        }
      }

      const stored = await database.findDocument(documentName);
      if (stored && stored.byteLength > 0) {
        Y.applyUpdate(document, stored);
      }
    },

    // Contrôle de taille et de débit avant traitement de chaque message entrant.
    async beforeHandleMessage({ update, socketId, documentName }) {
      const check = guard.checkMessage(socketId, update.byteLength);
      if (!check.allowed) {
        console.warn(
          `[collab-server] Message refusé (${documentName}, socket ${socketId}) : ${check.reason}`
        );
        throw new Error(check.reason ?? 'Message refusé.');
      }
    },

    // Libération des compteurs à la déconnexion.
    async onDisconnect({ context, socketId }) {
      releaseGuardConnection(guard, context);
      guard.releaseMessageBucket(socketId);
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
