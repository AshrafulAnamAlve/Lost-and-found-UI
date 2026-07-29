import { Injectable, inject, signal } from '@angular/core';
import { MessageService } from './message.service';

// STUN (discovery) + free public TURN relay (Open Relay) so calls also work
// across different networks / NAT once the app is served over HTTPS.
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',                 username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',                username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected';

@Injectable({ providedIn: 'root' })
export class CallService {
  private msg = inject(MessageService);
  private pc?: RTCPeerConnection;
  private pendingIce: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;
  private callTimer?: ReturnType<typeof setTimeout>;

  state        = signal<CallState>('idle');
  remoteName   = signal('');
  remoteUserId = signal(0);
  callType     = signal<'audio' | 'video'>('video');
  localStream  = signal<MediaStream | null>(null);
  remoteStream = signal<MediaStream | null>(null);
  muted        = signal(false);
  cameraOff    = signal(false);

  private get myId()   { return Number(localStorage.getItem('userid') || 0); }
  private get myName() { return localStorage.getItem('username') || 'User'; }

  constructor() {
    this.msg.on('IncomingCall',  (d: any) => this.onIncoming(d));
    this.msg.on('CallAccepted',  ()       => this.onAccepted());
    this.msg.on('CallRejected',  ()       => this.onRejected());
    this.msg.on('ReceiveOffer',  (d: any) => this.onOffer(d));
    this.msg.on('ReceiveAnswer', (d: any) => this.onAnswer(d));
    this.msg.on('ReceiveIce',    (d: any) => this.onIce(d));
    this.msg.on('CallEnded',     ()       => this.cleanup());
  }

  // ── Caller ──────────────────────────────────────────────
  async startCall(toUserId: number, name: string, type: 'audio' | 'video') {
    if (this.state() !== 'idle' || !toUserId) return;
    if (Number(toUserId) === this.myId) {
      alert("You can't call yourself. To test, open the other user in a different browser or an incognito window.");
      return;
    }
    this.callType.set(type);
    this.remoteUserId.set(toUserId);
    this.remoteName.set(name || 'User');
    try {
      await this.initLocalMedia(type);
    } catch {
      this.cleanup();
      alert('Please allow camera & microphone access to start a call.');
      return;
    }
    this.createPc(toUserId);
    this.state.set('calling');
    this.msg.invoke('CallUser', toUserId, this.myId, this.myName, type);
    // Give up if nobody answers (also covers the other user being offline).
    this.callTimer = setTimeout(() => {
      if (this.state() === 'calling') { this.cleanup(); alert('No answer.'); }
    }, 35000);
  }

  private async onAccepted() {
    if (this.state() !== 'calling' || !this.pc) return;
    clearTimeout(this.callTimer);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.msg.invoke('SendOffer', this.remoteUserId(), this.myId, JSON.stringify(offer));
  }

  private async onAnswer(d: any) {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(JSON.parse(d.sdp));
    this.remoteDescSet = true;
    this.flushIce();
    this.state.set('connected');
  }

  // ── Callee ──────────────────────────────────────────────
  private onIncoming(d: any) {
    // Ignore a call that loops back to ourselves (same browser profile / two tabs).
    if (Number(d.fromUserId) === this.myId) return;
    if (this.state() !== 'idle') { this.msg.invoke('RejectCall', d.fromUserId, this.myId); return; }
    this.remoteUserId.set(d.fromUserId);
    this.remoteName.set(d.fromName || 'User');
    this.callType.set(d.callType === 'audio' ? 'audio' : 'video');
    this.state.set('incoming');
  }

  async accept() {
    if (this.state() !== 'incoming') return;
    try {
      await this.initLocalMedia(this.callType());
    } catch {
      alert('Please allow camera & microphone access to accept the call.');
      this.reject();
      return;
    }
    this.createPc(this.remoteUserId());
    this.state.set('connected');
    this.msg.invoke('AcceptCall', this.remoteUserId(), this.myId);
  }

  reject() {
    if (this.remoteUserId()) this.msg.invoke('RejectCall', this.remoteUserId(), this.myId);
    this.cleanup();
  }

  private async onOffer(d: any) {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(JSON.parse(d.sdp));
    this.remoteDescSet = true;
    this.flushIce();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.msg.invoke('SendAnswer', this.remoteUserId(), this.myId, JSON.stringify(answer));
  }

  // ── Shared ──────────────────────────────────────────────
  private onIce(d: any) {
    const cand: RTCIceCandidateInit = JSON.parse(d.candidate);
    if (this.pc && this.remoteDescSet) this.pc.addIceCandidate(cand).catch(() => {});
    else this.pendingIce.push(cand);
  }

  private flushIce() {
    if (!this.pc) return;
    this.pendingIce.forEach(c => this.pc!.addIceCandidate(c).catch(() => {}));
    this.pendingIce = [];
  }

  private onRejected() { alert('Call was declined.'); this.cleanup(); }

  private async initLocalMedia(type: 'audio' | 'video') {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
    this.localStream.set(stream);
    this.muted.set(false);
    this.cameraOff.set(false);
  }

  private createPc(otherId: number) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.remoteDescSet = false;
    this.pendingIce = [];

    this.localStream()?.getTracks().forEach(t => pc.addTrack(t, this.localStream()!));

    const remote = new MediaStream();
    this.remoteStream.set(remote);
    pc.ontrack = (e) => {
      (e.streams[0]?.getTracks() ?? [e.track]).forEach(t => remote.addTrack(t));
      this.remoteStream.set(remote);
      this.state.set('connected');
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.msg.invoke('SendIce', otherId, this.myId, JSON.stringify(e.candidate));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') { alert('Call connection failed (network/firewall).'); this.cleanup(); }
    };
    this.pc = pc;
  }

  toggleMute() {
    const s = this.localStream(); if (!s) return;
    const next = !this.muted();
    s.getAudioTracks().forEach(t => (t.enabled = !next));
    this.muted.set(next);
  }

  toggleCamera() {
    const s = this.localStream(); if (!s) return;
    const next = !this.cameraOff();
    s.getVideoTracks().forEach(t => (t.enabled = !next));
    this.cameraOff.set(next);
  }

  hangup() {
    if (this.remoteUserId()) this.msg.invoke('EndCall', this.remoteUserId(), this.myId);
    this.cleanup();
  }

  private cleanup() {
    clearTimeout(this.callTimer);
    this.localStream()?.getTracks().forEach(t => t.stop());
    this.pc?.close();
    this.pc = undefined;
    this.pendingIce = [];
    this.remoteDescSet = false;
    this.localStream.set(null);
    this.remoteStream.set(null);
    this.muted.set(false);
    this.cameraOff.set(false);
    this.remoteName.set('');
    this.remoteUserId.set(0);
    this.state.set('idle');
  }
}
