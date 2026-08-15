import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { LocalCollaborationProvider } from './LocalCollaborationProvider';

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('LocalCollaborationProvider', () => {
  it('synchronizes Yjs updates between editors in the same room', async () => {
    if (typeof BroadcastChannel === 'undefined') return;

    const room = `qoe-test-${Date.now()}-${Math.random()}`;
    const firstDoc = new Y.Doc();
    const secondDoc = new Y.Doc();
    const first = new LocalCollaborationProvider(firstDoc, room);
    const second = new LocalCollaborationProvider(secondDoc, room);

    await wait(20);
    firstDoc.getMap('article').set('title', 'Titre partagé');
    await wait(40);

    expect(secondDoc.getMap('article').get('title')).toBe('Titre partagé');
    expect(first.peerCount).toBeGreaterThanOrEqual(1);

    first.destroy();
    second.destroy();
    expect(first.peerCount).toBe(0);
  });
});
