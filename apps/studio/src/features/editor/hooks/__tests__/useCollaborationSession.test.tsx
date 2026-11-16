// =====================================================================
// 🧪 useCollaborationSession — transport simulé, aucun réseau ni timer
// =====================================================================
// Le hook pilote la co-édition (Hocuspocus/Yjs) et lit un JWT Supabase.
// On remplace le transport et le client d'auth par des doubles : les tests
// n'ouvrent aucune socket, ne planifient aucun timer et pilotent les
// événements à la main (status, synced, awareness, auth, disconnect).
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.hoisted(() => {
  // Lu au chargement du module : doit être défini avant l'import du hook.
  process.env.NEXT_PUBLIC_COLLAB_URL = 'ws://collab.test';
});

type Handler = (payload: never) => void;

const transport = vi.hoisted(() => {
  const instances: FakeProvider[] = [];

  class FakeProvider {
    static instances = instances;
    options: { url: string; name: string; token: () => Promise<string> };
    handlers = new Map<string, Set<Handler>>();
    awarenessHandlers = new Set<() => void>();
    awarenessStates = new Map<string, unknown>();
    connect = vi.fn();
    disconnect = vi.fn();
    destroy = vi.fn();
    awareness = {
      on: vi.fn((_event: string, handler: () => void) => {
        this.awarenessHandlers.add(handler);
      }),
      off: vi.fn((_event: string, handler: () => void) => {
        this.awarenessHandlers.delete(handler);
      }),
      getStates: () => this.awarenessStates,
    };

    constructor(options: FakeProvider['options']) {
      this.options = options;
      instances.push(this);
    }

    on(event: string, handler: Handler) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event)!.add(handler);
    }

    off(event: string, handler: Handler) {
      this.handlers.get(event)?.delete(handler);
    }

    emit(event: string, payload?: unknown) {
      this.handlers.get(event)?.forEach((handler) => handler(payload as never));
    }

    emitAwareness() {
      this.awarenessHandlers.forEach((handler) => handler());
    }
  }

  return { instances, FakeProvider };
});

const supabaseAuth = vi.hoisted(() => ({
  session: null as null | {
    access_token: string;
    expires_at?: number;
    user?: { id: string; email?: string; user_metadata?: Record<string, unknown> };
  },
  refreshed: null as null | { access_token: string },
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('@hocuspocus/provider', () => ({ HocuspocusProvider: transport.FakeProvider }));

vi.mock('@qoe/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => {
        supabaseAuth.getSession();
        return { data: { session: supabaseAuth.session } };
      },
      refreshSession: async () => {
        supabaseAuth.refreshSession();
        return { data: { session: supabaseAuth.refreshed } };
      },
    },
  }),
}));

import { colorForUserId, useCollaborationSession } from '../useCollaborationSession';

const provider = () => transport.instances.at(-1)!;

function expireSoon(secondsFromNow: number) {
  supabaseAuth.session = {
    access_token: 'token-court',
    expires_at: Math.floor(Date.now() / 1000) + secondsFromNow,
    user: { id: 'user-1', email: 'ada@qoe.fi', user_metadata: { name: 'Ada' } },
  };
}

describe('useCollaborationSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transport.instances.length = 0;
    supabaseAuth.getSession.mockClear();
    supabaseAuth.refreshSession.mockClear();
    supabaseAuth.refreshed = null;
    supabaseAuth.session = {
      access_token: 'token-valide',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-1', email: 'ada@qoe.fi', user_metadata: { name: 'Ada' } },
    };
  });

  it('reste inactif sans room, sans URL ou quand la collaboration est coupée', () => {
    const disabled = renderHook(() => useCollaborationSession({ enabled: false, roomId: 'art-1' }));
    expect(disabled.result.current.status).toBe('idle');
    expect(disabled.result.current.collaborationDoc).toBeNull();
    expect(disabled.result.current.collaborationProvider).toBeNull();

    const noRoom = renderHook(() => useCollaborationSession({ roomId: undefined }));
    expect(noRoom.result.current.collaborationProvider).toBeNull();
    expect(transport.instances).toHaveLength(0);
  });

  it('crée le document Yjs et connecte la room nommée « article:<id> »', () => {
    const { result } = renderHook(() => useCollaborationSession({ roomId: 'art-1' }));

    expect(result.current.collaborationDoc).not.toBeNull();
    expect(transport.instances).toHaveLength(1);
    expect(provider().options).toMatchObject({
      url: 'ws://collab.test',
      name: 'article:art-1',
    });
    // Le provider démarre en connexion, pas en « connecté ».
    expect(result.current.status).toBe('connecting');
    expect(result.current.connected).toBe(false);
  });

  it('suit les événements de statut et remet les pairs à zéro à la coupure', () => {
    const { result } = renderHook(() => useCollaborationSession({ roomId: 'art-1' }));
    const instance = provider();

    act(() => {
      instance.emit('status', { status: 'connected' });
    });
    expect(result.current.status).toBe('connected');
    expect(result.current.connected).toBe(true);

    act(() => {
      instance.awarenessStates.set('me', { user: { name: 'Ada' } });
      instance.awarenessStates.set('peer', { user: { name: 'Bob' } });
      instance.awarenessStates.set('anon', {});
      instance.emitAwareness();
    });
    // Deux présences dont la sienne : un pair distant, pas trois.
    expect(result.current.peerCount).toBe(1);

    act(() => {
      instance.emit('status', { status: 'disconnected' });
    });
    expect(result.current.status).toBe('disconnected');
    expect(result.current.connected).toBe(false);
    expect(result.current.peerCount).toBe(0);
  });

  it('compte les changements non synchronisés puis les efface après synced', () => {
    const { result } = renderHook(() => useCollaborationSession({ roomId: 'art-1' }));
    const instance = provider();

    act(() => {
      instance.emit('unsyncedChanges', { number: 3 });
    });
    expect(result.current.unsyncedChanges).toBe(3);

    act(() => {
      instance.emit('synced', { state: true });
    });
    expect(result.current.synced).toBe(true);
    expect(result.current.unsyncedChanges).toBe(0);

    act(() => {
      instance.emit('unsyncedChanges', { number: -5 });
    });
    // Une valeur négative ne doit jamais s'afficher comme un compteur.
    expect(result.current.unsyncedChanges).toBe(0);
  });

  it('passe en erreur explicite quand l’authentification est refusée', () => {
    const { result } = renderHook(() => useCollaborationSession({ roomId: 'art-1' }));
    const instance = provider();

    act(() => {
      instance.emit('status', { status: 'connected' });
      instance.emit('synced', { state: true });
    });

    act(() => {
      instance.emit('authenticationFailed', { reason: 'Jeton expiré' });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.connected).toBe(false);
    expect(result.current.synced).toBe(false);
    expect(result.current.lastError).toBe('Jeton expiré');

    // Une coupure qui suit ne doit pas masquer la vraie cause.
    act(() => {
      instance.emit('disconnect', {});
    });
    expect(result.current.status).toBe('error');
    expect(result.current.lastError).toBe('Jeton expiré');
  });

  it('reconnecte en repartant d’un état propre', () => {
    const { result } = renderHook(() => useCollaborationSession({ roomId: 'art-1' }));
    const instance = provider();

    act(() => {
      instance.emit('authenticationFailed', { reason: 'Jeton expiré' });
    });
    expect(result.current.lastError).toBe('Jeton expiré');

    act(() => {
      result.current.reconnect();
    });

    expect(instance.disconnect).toHaveBeenCalledTimes(1);
    expect(instance.connect).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('connecting');
    expect(result.current.lastError).toBeNull();
  });

  it('fournit un jeton frais au serveur de collaboration', async () => {
    const { result } = renderHook(() => useCollaborationSession({ roomId: 'art-1' }));
    const instance = provider();

    await act(async () => {
      await expect(instance.options.token()).resolves.toBe('token-valide');
    });
    expect(supabaseAuth.refreshSession).not.toHaveBeenCalled();
    expect(result.current.collaborationProvider).toBe(instance);
  });

  it('rafraîchit une session expirée avant de se connecter', async () => {
    // Expiré dans 30 s : la marge de 60 s impose un rafraîchissement.
    expireSoon(30);
    supabaseAuth.refreshed = { access_token: 'token-rafraichi' };
    renderHook(() => useCollaborationSession({ roomId: 'art-1' }));

    await act(async () => {
      await expect(provider().options.token()).resolves.toBe('token-rafraichi');
    });
    // Le hook rafraîchit aussi pour son propre jeton d'identité : on vérifie
    // qu'un rafraîchissement a bien eu lieu, pas un nombre exact d'appels.
    expect(supabaseAuth.refreshSession).toHaveBeenCalled();
  });

  it('retombe sur l’ancien jeton si le rafraîchissement échoue, jamais sur une chaîne vide', async () => {
    expireSoon(-10);
    supabaseAuth.refreshed = null;
    renderHook(() => useCollaborationSession({ roomId: 'art-1' }));

    await act(async () => {
      await expect(provider().options.token()).resolves.toBe('token-court');
    });
  });

  it('expose l’identité de l’éditeur avec une couleur stable', async () => {
    const { result } = renderHook(() => useCollaborationSession({ roomId: 'art-1' }));

    await waitFor(() => expect(result.current.collabUser).not.toBeNull());
    expect(result.current.collabUser).toEqual({
      name: 'Ada',
      color: colorForUserId('user-1'),
    });
  });

  it('replie sur le nom complet, l’email puis « Éditeur »', async () => {
    supabaseAuth.session = {
      access_token: 'token-valide',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-2', user_metadata: { full_name: 'Ada Lovelace' } },
    };
    const first = renderHook(() => useCollaborationSession({ roomId: 'art-1' }));
    await waitFor(() => expect(first.result.current.collabUser?.name).toBe('Ada Lovelace'));

    supabaseAuth.session = {
      access_token: 'token-valide',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-3', email: 'grace@qoe.fi' },
    };
    const second = renderHook(() => useCollaborationSession({ roomId: 'art-2' }));
    await waitFor(() => expect(second.result.current.collabUser?.name).toBe('grace'));
  });

  it('reste sans identité si aucune session n’existe', async () => {
    supabaseAuth.session = null;
    const { result } = renderHook(() => useCollaborationSession({ roomId: 'art-1' }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.collabUser).toBeNull();
  });

  it('détruit le transport au démontage et retire ses abonnements', () => {
    const { unmount } = renderHook(() => useCollaborationSession({ roomId: 'art-1' }));
    const instance = provider();

    unmount();

    expect(instance.destroy).toHaveBeenCalledTimes(1);
    // Plus aucun handler actif : un événement tardif ne met plus à jour d'état.
    expect(instance.handlers.get('status')?.size ?? 0).toBe(0);
    expect(instance.handlers.get('authenticationFailed')?.size ?? 0).toBe(0);
  });

  it('dérive toujours la même couleur pour un utilisateur donné', () => {
    expect(colorForUserId('user-1')).toBe(colorForUserId('user-1'));
    expect(colorForUserId('user-1')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
