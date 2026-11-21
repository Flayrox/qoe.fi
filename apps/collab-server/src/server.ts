// =====================================================================
// 🧵 Factory du serveur Hocuspocus — réutilisable (prod + tests)
// =====================================================================
// `index.ts` assemble la config (env) puis délègue ici. Les tests
// d'intégration instancient la même factory avec une base mémoire et un
// verifier factice pour vérifier la synchro Yjs de bout en bout.
// =====================================================================

import type { IncomingMessage } from 'node:http';
import { Hocuspocus } from '@hocuspocus/server';
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
  /** Fait-on confiance aux en-têtes proxy (X-Real-IP / X-Forwarded-For) ? */
  trustProxy?: boolean;
}

interface CollabConnectionContext {
  name?: string;
  userId?: string;
  clientIp?: string;
  guardAcquired?: boolean;
  authorized?: boolean;
}

export function extractClientIp(request?: IncomingMessage, trustProxy = false): string {
  if (!trustProxy) {
    return request?.socket?.remoteAddress ?? 'unknown';
  }

  const realIp = request?.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim().length > 0) {
    return realIp.trim();
  }

  const forwardedFor = request?.headers['x-forwarded-for'];
  const rawList = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
  if (typeof rawList === 'string' && rawList.trim().length > 0) {
    const hops = rawList
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    // Le dernier saut non vide correspond au client vu par notre reverse-proxy de bordure.
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
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

function isEmptyYjsState(state: Uint8Array): boolean {
  return state.byteLength === 0 || (state.byteLength === 2 && state[0] === 0 && state[1] === 0);
}

export type CollabServer = Hocuspocus;

export function createCollabServer(options: CollabServerOptions): CollabServer {
  const { database, verifier, maxDocumentBytes, name = 'qoe-collab', trustProxy = false } = options;
  const canEditDocument = options.canEditDocument;
  const guard = options.guard ?? new CollabGuard();

  // Instanciation dédiée (jamais `Server.configure`) pour isoler les hooks et
  // éviter toute fuite d'extensions entre instances en tests ou en mémoire.
  return new Hocuspocus({
    name,
    stopOnSignals: false,

    // Pré-contrôle à la connexion WebSocket (blocage IP brute-force ou saturation IP).
    async onConnect({ request, documentName }) {
      const ip = extractClientIp(request, trustProxy);
      if (guard.isIPBlocked(ip)) {
        console.warn(`[collab-server] Connexion refusée (IP bloquée ${ip}) : ${documentName}`);
        throw new Error('Adresse IP temporairement bloquée.');
      }
      if (guard.isIPAtConnectionLimit(ip)) {
        console.warn(`[collab-server] Connexion refusée (plafond IP ${ip}) : ${documentName}`);
        throw new Error('Plafond de connexions atteint pour cette adresse IP.');
      }
      return { clientIp: ip };
    },

    // Authentification + autorisation de CHAQUE connexion (même si le document
    // est déjà chargé en mémoire pour un autre éditeur).
    async onAuthenticate({ token, documentName, request }) {
      const ip = extractClientIp(request, trustProxy);
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

      if (canEditDocument) {
        const allowed = await canEditDocument(user.id, documentName);
        if (!allowed) {
          console.warn(
            `[collab-server] Accès refusé (pas éditeur) : ${documentName} (user ${user.id})`
          );
          throw new Error("Vous n'avez pas le droit d'éditer cet article.");
        }
      }

      const connCheck = guard.acquireConnection(user.id, ip);
      if (!connCheck.allowed) {
        console.warn(
          `[collab-server] Connexion refusée (quota) : ${documentName} (user ${user.id}, ip ${ip})`
        );
        throw new Error(connCheck.reason ?? 'Plafond de connexions atteint.');
      }

      return {
        name: user.name,
        userId: user.id,
        clientIp: ip,
        guardAcquired: true,
        authorized: true,
      };
    },

    // Chargement du document lors de son ouverture initiale : défense en profondeur
    // sur `context.authorized`, puis application sécurisée de l'état persisté.
    async onLoadDocument({ documentName, document, context }) {
      if (canEditDocument) {
        const ctx = context as CollabConnectionContext | undefined;
        if (ctx?.authorized !== true) {
          releaseGuardConnection(guard, context);
          throw new Error("Vous n'avez pas le droit d'éditer cet article.");
        }
      }

      const stored = await database.findDocument(documentName);
      if (stored && stored.byteLength > 0) {
        try {
          Y.applyUpdate(document, stored);
        } catch (error: unknown) {
          console.error(`[collab-server] État Yjs corrompu pour ${documentName} :`, error);
          throw new Error(`Impossible de charger le document collaboratif (${documentName}).`);
        }
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

      // Nettoyage : document vide sans client restant → on libère sans réécrire.
      if (isEmptyYjsState(state) && clientsCount === 0) {
        await database.deleteDocument(documentName);
        return;
      }

      if (state.byteLength > maxDocumentBytes) {
        console.warn(
          `[collab-server] Document ${documentName} refusé : ${state.byteLength} octets > ` +
            `${maxDocumentBytes}`
        );
        return;
      }
      await database.updateDocument(documentName, state);
    },
  });
}
