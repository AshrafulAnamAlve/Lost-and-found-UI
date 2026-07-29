import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';

const API = 'https://localhost:7124/api/Messages';
const HUB = 'https://localhost:7124/chatHub';

export interface ChatMessage {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  sentAt: string;
  isRead: boolean;
  itemId?: number;
  itemType?: string;
  itemName?: string;
}

export interface Conversation {
  partnerId: number;
  partnerName: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
  itemName?: string;
}

@Injectable({ providedIn: 'root' })
export class MessageService {
  private http = inject(HttpClient);
  private conn?: HubConnection;
  // Extra hub handlers (e.g. call signaling) registered before the connection exists.
  private extraHandlers: Array<[string, (...a: any[]) => void]> = [];

  private _unreadCount    = signal(0);
  private _conversations  = signal<Conversation[]>([]);
  private _activeMessages = signal<ChatMessage[]>([]);
  private _activePartner  = signal<number | null>(null);

  readonly unreadCount    = this._unreadCount.asReadonly();
  readonly conversations  = this._conversations.asReadonly();
  readonly activeMessages = this._activeMessages.asReadonly();
  readonly activePartner  = this._activePartner.asReadonly();

  private get uid(): number { return Number(localStorage.getItem('userid') || 0); }

  /** Open the realtime connection (called after login / on navbar init). */
  connect() {
    const uid = this.uid;
    if (!uid || this.conn) return;
    this.conn = new HubConnectionBuilder()
      .withUrl(`${HUB}?userId=${uid}`, { withCredentials: true })
      .withAutomaticReconnect()
      .build();
    this.conn.on('ReceiveMessage', (msg: ChatMessage) => this.onReceive(msg));
    // Attach any handlers registered before the connection was built (e.g. CallService).
    this.extraHandlers.forEach(([evt, cb]) => this.conn!.on(evt, cb));
    this.conn.start()
      .then(() => { this.loadUnreadCount(); this.loadConversations(); })
      .catch(() => { /* page still works via REST polling on navigation */ });
  }

  /** Register a hub event handler (works whether or not the connection exists yet). */
  on(event: string, cb: (...args: any[]) => void) {
    this.extraHandlers.push([event, cb]);
    this.conn?.on(event, cb);
  }

  /** Invoke a hub method if connected (used for call signaling). */
  invoke(method: string, ...args: any[]): Promise<any> {
    if (this.conn && this.conn.state === HubConnectionState.Connected) return this.conn.invoke(method, ...args);
    return Promise.resolve();
  }

  disconnect() {
    this.conn?.stop();
    this.conn = undefined;
    this._unreadCount.set(0);
    this._conversations.set([]);
    this._activeMessages.set([]);
    this._activePartner.set(null);
  }

  private onReceive(msg: ChatMessage) {
    const myId = this.uid;
    const partner = this._activePartner();
    const inActive = partner != null &&
      ((msg.senderId === partner && msg.receiverId === myId) ||
       (msg.senderId === myId && msg.receiverId === partner));

    if (inActive && msg.receiverId === myId) {
      // Incoming message in the thread I'm viewing -> reload (appends + marks read).
      this.loadConversation(partner!);
    } else if (inActive) {
      // My own message echoed back -> append once.
      this._activeMessages.update(l => l.some(m => m.id === msg.id) ? l : [...l, msg]);
    }
    this.loadUnreadCount();
    this.loadConversations();
  }

  loadUnreadCount() {
    if (!this.uid) return;
    this.http.get<{ count: number }>(`${API}/UnreadCount/${this.uid}`)
      .subscribe({ next: r => this._unreadCount.set(r.count), error: () => {} });
  }

  loadConversations() {
    if (!this.uid) return;
    this.http.get<Conversation[]>(`${API}/Conversations/${this.uid}`)
      .subscribe({ next: c => this._conversations.set(c), error: () => {} });
  }

  loadConversation(otherUserId: number) {
    this._activePartner.set(otherUserId);
    this.http.get<ChatMessage[]>(`${API}/Conversation/${this.uid}/${otherUserId}`)
      .subscribe({
        next: list => { this._activeMessages.set(list); this.loadUnreadCount(); },
        error: () => this._activeMessages.set([]),
      });
  }

  clearActive() { this._activePartner.set(null); this._activeMessages.set([]); }

  send(receiverId: number, content: string,
       ctx?: { itemId?: number; itemType?: string; itemName?: string }) {
    const body = {
      senderId: this.uid, receiverId, content: content.trim(),
      itemId: ctx?.itemId, itemType: ctx?.itemType, itemName: ctx?.itemName,
    };
    this.http.post<ChatMessage>(`${API}/Send`, body).subscribe({
      next: saved => {
        this._activeMessages.update(l => l.some(m => m.id === saved.id) ? l : [...l, saved]);
        this.loadConversations();
      },
      error: () => {},
    });
  }
}
