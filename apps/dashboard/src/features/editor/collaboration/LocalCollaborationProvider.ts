import * as Y from 'yjs';

type CollaborationStatus = 'connecting' | 'connected' | 'disconnected';
type StatusListener = (status: CollaborationStatus, peerCount: number) => void;

type CollaborationMessage =
  | { type: 'join'; clientId: string }
  | { type: 'leave'; clientId: string }
  | { type: 'sync-request'; clientId: string }
  | { type: 'sync-response'; clientId: string; update: Uint8Array }
  | { type: 'update'; clientId: string; update: Uint8Array };

/**
 * Same-browser collaboration transport used for the editor trial.
 * It deliberately stays dependency-free on the server side: Yjs updates are
 * exchanged through BroadcastChannel and still flow through the normal autosave.
 */
export class LocalCollaborationProvider {
  readonly doc: Y.Doc;
  readonly roomName: string;
  readonly clientId: string;

  private readonly channel: BroadcastChannel | null;
  private readonly peers = new Set<string>();
  private readonly listeners = new Set<StatusListener>();
  private status: CollaborationStatus = 'connecting';
  private destroyed = false;

  constructor(doc: Y.Doc, roomName: string) {
    this.doc = doc;
    this.roomName = roomName;
    this.clientId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(roomName) : null;

    this.doc.on('update', this.handleDocumentUpdate);
    this.channel?.addEventListener('message', this.handleMessage);
    this.setStatus('connected');
    this.post({ type: 'join', clientId: this.clientId });
    this.post({ type: 'sync-request', clientId: this.clientId });
  }

  get peerCount() {
    return this.peers.size;
  }

  onStatus(listener: StatusListener) {
    this.listeners.add(listener);
    listener(this.status, this.peerCount);
    return () => this.listeners.delete(listener);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.post({ type: 'leave', clientId: this.clientId });
    this.doc.off('update', this.handleDocumentUpdate);
    this.channel?.removeEventListener('message', this.handleMessage);
    this.channel?.close();
    this.peers.clear();
    this.setStatus('disconnected');
  }

  private readonly handleDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    if (this.destroyed || origin === this) return;
    this.post({ type: 'update', clientId: this.clientId, update });
  };

  private readonly handleMessage = (event: MessageEvent<CollaborationMessage>) => {
    const message = event.data;
    if (!message || message.clientId === this.clientId) return;

    if (message.type === 'join') {
      this.peers.add(message.clientId);
      this.emitStatus();
      this.post({
        type: 'sync-response',
        clientId: this.clientId,
        update: Y.encodeStateAsUpdate(this.doc),
      });
      return;
    }

    if (message.type === 'leave') {
      this.peers.delete(message.clientId);
      this.emitStatus();
      return;
    }

    if (message.type === 'sync-request') {
      this.peers.add(message.clientId);
      this.emitStatus();
      this.post({
        type: 'sync-response',
        clientId: this.clientId,
        update: Y.encodeStateAsUpdate(this.doc),
      });
      return;
    }

    if (message.type === 'sync-response' || message.type === 'update') {
      this.peers.add(message.clientId);
      Y.applyUpdate(this.doc, new Uint8Array(message.update), this);
      this.emitStatus();
    }
  };

  private post(message: CollaborationMessage) {
    if (!this.destroyed) this.channel?.postMessage(message);
  }

  private setStatus(status: CollaborationStatus) {
    this.status = status;
    this.emitStatus();
  }

  private emitStatus() {
    for (const listener of this.listeners) listener(this.status, this.peerCount);
  }
}
