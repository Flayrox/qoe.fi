// =====================================================================
// 📡 QoeAuthBroadcastChannel — Synchronisation d'Auth Inter-Onglets (Cross-Tab)
// =====================================================================
// Pattern inspiré de Bluesky et Elk : lors d'un login, logout ou refresh token,
// cet utilitaire notifie instantanément les autres onglets du navigateur.

export type AuthChangeEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';

export interface AuthBroadcastMessage {
  event: AuthChangeEvent;
  userId?: string;
  timestamp: number;
}

const CHANNEL_NAME = 'qoe_auth_broadcast_channel';

const AUTH_EVENTS: readonly AuthChangeEvent[] = ['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED'];

/**
 * Valide un message reçu : n'importe quel script de la page peut poster sur le
 * canal, un événement inconnu ne doit pas déclencher de logique d'auth.
 */
export function isAuthBroadcastMessage(value: unknown): value is AuthBroadcastMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<AuthBroadcastMessage>;
  return (
    typeof message.event === 'string' &&
    (AUTH_EVENTS as readonly string[]).includes(message.event) &&
    typeof message.timestamp === 'number'
  );
}

export function sendAuthBroadcast(event: AuthChangeEvent, userId?: string) {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const message: AuthBroadcastMessage = {
      event,
      userId,
      timestamp: Date.now(),
    };
    channel.postMessage(message);
    channel.close();
  } catch (e) {
    console.warn('Failed to send auth broadcast:', e);
  }
}

export function subscribeToAuthBroadcast(
  onAuthChange: (message: AuthBroadcastMessage) => void
): () => void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return () => {};
  }

  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const handler = (event: MessageEvent<unknown>) => {
      if (isAuthBroadcastMessage(event.data)) {
        onAuthChange(event.data);
      }
    };

    channel.addEventListener('message', handler);

    return () => {
      channel.removeEventListener('message', handler);
      channel.close();
    };
  } catch (e) {
    console.warn('Failed to subscribe to auth broadcast:', e);
    return () => {};
  }
}
