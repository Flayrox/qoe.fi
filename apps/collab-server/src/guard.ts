// =====================================================================
// 🛡️ Guard — Limites anti-abus (connexions, débit, taille, auth brute-force)
// =====================================================================
// Protège le serveur Hocuspocus contre :
//   - le flood de connexions par utilisateur ou par adresse IP ;
//   - le brute-force de jetons JWT (cooldown IP après N échecs) ;
//   - les messages WebSocket surdimensionnés (> maxMessageBytes) ;
//   - les rafales de messages (rate limit par fenêtre glissante/fixe).
// =====================================================================

export interface CollabGuardOptions {
  /** Nombre maximal de connexions simultanées par utilisateur (défaut : 10). */
  maxConnsPerUser?: number;
  /** Nombre maximal de connexions simultanées par IP (défaut : 25). */
  maxConnsPerIP?: number;
  /** Taille maximale d'un message WebSocket en octets (défaut : 128 KiB). */
  maxMessageBytes?: number;
  /** Nombre maximal de messages autorisés par fenêtre (défaut : 120). */
  maxMessagesPerWindow?: number;
  /** Durée de la fenêtre de débit en ms (défaut : 10 000 ms). */
  windowMs?: number;
  /** Nombre maximal d'échecs d'auth par IP avant blocage temporaire (défaut : 10). */
  maxAuthFailuresPerIP?: number;
  /** Durée de la fenêtre / cooldown d'échecs d'auth en ms (défaut : 60 000 ms). */
  authFailureWindowMs?: number;
  /** Horloge injectable pour les tests unitaires (défaut : Date.now). */
  now?: () => number;
}

export interface GuardCheckResult {
  allowed: boolean;
  reason?: string;
}

interface MessageBucket {
  count: number;
  windowStart: number;
}

export class CollabGuard {
  private readonly maxConnsPerUser: number;
  private readonly maxConnsPerIP: number;
  private readonly maxMessageBytes: number;
  private readonly maxMessagesPerWindow: number;
  private readonly windowMs: number;
  private readonly maxAuthFailuresPerIP: number;
  private readonly authFailureWindowMs: number;
  private readonly now: () => number;

  private readonly userConns = new Map<string, number>();
  private readonly ipConns = new Map<string, number>();
  private readonly authFailures = new Map<string, number[]>();
  private readonly messageBuckets = new Map<string, MessageBucket>();

  constructor(options: CollabGuardOptions = {}) {
    this.maxConnsPerUser = options.maxConnsPerUser ?? 10;
    this.maxConnsPerIP = options.maxConnsPerIP ?? 25;
    this.maxMessageBytes = options.maxMessageBytes ?? 131_072; // 128 KiB
    this.maxMessagesPerWindow = options.maxMessagesPerWindow ?? 120;
    this.windowMs = options.windowMs ?? 10_000;
    this.maxAuthFailuresPerIP = options.maxAuthFailuresPerIP ?? 10;
    this.authFailureWindowMs = options.authFailureWindowMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  /**
   * Tente d'enregistrer une nouvelle connexion pour `(userId, ip)`.
   * Vérifie les deux plafonds avant d'incrémenter les compteurs.
   */
  acquireConnection(userId: string, ip: string): GuardCheckResult {
    const currentUserConns = this.userConns.get(userId) ?? 0;
    if (currentUserConns >= this.maxConnsPerUser) {
      return {
        allowed: false,
        reason: `Plafond de connexions atteint pour l'utilisateur (${this.maxConnsPerUser}).`,
      };
    }

    const currentIpConns = this.ipConns.get(ip) ?? 0;
    if (currentIpConns >= this.maxConnsPerIP) {
      return {
        allowed: false,
        reason: `Plafond de connexions atteint pour cette adresse IP (${this.maxConnsPerIP}).`,
      };
    }

    this.userConns.set(userId, currentUserConns + 1);
    this.ipConns.set(ip, currentIpConns + 1);
    return { allowed: true };
  }

  /** Libère une connexion précédemment acquise par `(userId, ip)`. */
  releaseConnection(userId: string, ip: string): void {
    const currentUserConns = this.userConns.get(userId) ?? 0;
    if (currentUserConns <= 1) {
      this.userConns.delete(userId);
    } else {
      this.userConns.set(userId, currentUserConns - 1);
    }

    const currentIpConns = this.ipConns.get(ip) ?? 0;
    if (currentIpConns <= 1) {
      this.ipConns.delete(ip);
    } else {
      this.ipConns.set(ip, currentIpConns - 1);
    }
  }

  /** Enregistre un échec d'authentification pour `ip` dans la fenêtre courante. */
  recordAuthFailure(ip: string): void {
    const ts = this.now();
    const cutoff = ts - this.authFailureWindowMs;
    const recent = (this.authFailures.get(ip) ?? []).filter((t) => t > cutoff);
    recent.push(ts);
    this.authFailures.set(ip, recent);
  }

  /** Indique si `ip` est temporairement bloquée suite à trop d'échecs d'auth. */
  isIPBlocked(ip: string): boolean {
    const existing = this.authFailures.get(ip);
    if (!existing || existing.length === 0) return false;

    const cutoff = this.now() - this.authFailureWindowMs;
    const recent = existing.filter((t) => t > cutoff);
    if (recent.length === 0) {
      this.authFailures.delete(ip);
      return false;
    }
    if (recent.length !== existing.length) {
      this.authFailures.set(ip, recent);
    }
    return recent.length >= this.maxAuthFailuresPerIP;
  }

  /**
   * Vérifie la taille d'un message entrant et le débit par connexion.
   */
  checkMessage(connectionKey: string, byteLength: number): GuardCheckResult {
    if (byteLength > this.maxMessageBytes) {
      return {
        allowed: false,
        reason: `Message trop volumineux (${byteLength} octets > ${this.maxMessageBytes}).`,
      };
    }

    const ts = this.now();
    const bucket = this.messageBuckets.get(connectionKey);

    if (!bucket || ts - bucket.windowStart >= this.windowMs) {
      this.messageBuckets.set(connectionKey, { count: 1, windowStart: ts });
      return { allowed: true };
    }

    if (bucket.count >= this.maxMessagesPerWindow) {
      return {
        allowed: false,
        reason: `Débit de messages dépassé (${this.maxMessagesPerWindow}/${this.windowMs}ms).`,
      };
    }

    bucket.count += 1;
    return { allowed: true };
  }

  /** Nettoie l'état de débit associé à une connexion fermée. */
  releaseMessageBucket(connectionKey: string): void {
    this.messageBuckets.delete(connectionKey);
  }
}
