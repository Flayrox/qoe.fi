// =====================================================================
// 🧪 Tests unitaires — CollabGuard (anti-abus connexions, auth, débit)
// =====================================================================

import { describe, it, expect } from 'vitest';
import { CollabGuard } from './guard';

describe('CollabGuard', () => {
  describe('plafonds de connexions (utilisateur & IP)', () => {
    it('applique maxConnsPerUser et libère correctement à la déconnexion', () => {
      const guard = new CollabGuard({ maxConnsPerUser: 2, maxConnsPerIP: 10 });

      expect(guard.acquireConnection('user-1', '1.1.1.1').allowed).toBe(true);
      expect(guard.acquireConnection('user-1', '1.1.1.2').allowed).toBe(true);

      const third = guard.acquireConnection('user-1', '1.1.1.3');
      expect(third.allowed).toBe(false);
      expect(third.reason).toContain('utilisateur');

      // Un autre utilisateur reste autorisé.
      expect(guard.acquireConnection('user-2', '1.1.1.3').allowed).toBe(true);

      // Après libération, user-1 peut se reconnecter.
      guard.releaseConnection('user-1', '1.1.1.1');
      expect(guard.acquireConnection('user-1', '1.1.1.4').allowed).toBe(true);
    });

    it('applique maxConnsPerIP et ne fuite pas le compteur utilisateur en cas de rejet', () => {
      const guard = new CollabGuard({ maxConnsPerUser: 10, maxConnsPerIP: 2 });

      expect(guard.acquireConnection('user-1', '10.0.0.1').allowed).toBe(true);
      expect(guard.acquireConnection('user-2', '10.0.0.1').allowed).toBe(true);

      const blocked = guard.acquireConnection('user-3', '10.0.0.1');
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toContain('IP');

      // user-3 n'a pas été incrémenté par le rejet et peut se connecter depuis une autre IP.
      expect(guard.acquireConnection('user-3', '10.0.0.2').allowed).toBe(true);

      guard.releaseConnection('user-1', '10.0.0.1');
      expect(guard.acquireConnection('user-4', '10.0.0.1').allowed).toBe(true);
    });
  });

  describe("cooldown d'échecs d'authentification par IP", () => {
    it('bloque une IP après maxAuthFailuresPerIP échecs puis la débloque après 60s', () => {
      let nowMs = 1_000_000;
      const guard = new CollabGuard({
        maxAuthFailuresPerIP: 10,
        authFailureWindowMs: 60_000,
        now: () => nowMs,
      });

      for (let i = 0; i < 9; i++) {
        guard.recordAuthFailure('203.0.113.5');
        expect(guard.isIPBlocked('203.0.113.5')).toBe(false);
      }

      // 10e échec → IP bloquée.
      guard.recordAuthFailure('203.0.113.5');
      expect(guard.isIPBlocked('203.0.113.5')).toBe(true);
      expect(guard.isIPBlocked('203.0.113.6')).toBe(false);

      // À 59s, toujours bloquée.
      nowMs += 59_000;
      expect(guard.isIPBlocked('203.0.113.5')).toBe(true);

      // À 60s, la fenêtre expire → débloquée.
      nowMs += 1_000;
      expect(guard.isIPBlocked('203.0.113.5')).toBe(false);
    });
  });

  describe('taille maximale des messages (> 128 KiB)', () => {
    it('autorise exactement 128 KiB et rejette au-delà', () => {
      const guard = new CollabGuard();

      expect(guard.checkMessage('sock-1', 131_072).allowed).toBe(true);

      const oversized = guard.checkMessage('sock-1', 131_073);
      expect(oversized.allowed).toBe(false);
      expect(oversized.reason).toContain('volumineux');
    });
  });

  describe('rate-limit des rafales de messages', () => {
    it('bloque au-delà de maxMessagesPerWindow puis réinitialise après windowMs', () => {
      let nowMs = 500_000;
      const guard = new CollabGuard({
        maxMessagesPerWindow: 120,
        windowMs: 10_000,
        now: () => nowMs,
      });

      for (let i = 0; i < 120; i++) {
        expect(guard.checkMessage('sock-burst', 64).allowed).toBe(true);
      }

      const exceeded = guard.checkMessage('sock-burst', 64);
      expect(exceeded.allowed).toBe(false);
      expect(exceeded.reason).toContain('Débit');

      // Une autre connexion n'est pas impactée.
      expect(guard.checkMessage('sock-other', 64).allowed).toBe(true);

      // Après 10s, la fenêtre repart à zéro.
      nowMs += 10_000;
      expect(guard.checkMessage('sock-burst', 64).allowed).toBe(true);

      // Nettoyage explicite du bucket.
      guard.releaseMessageBucket('sock-burst');
      expect(guard.checkMessage('sock-burst', 64).allowed).toBe(true);
    });
  });
});
