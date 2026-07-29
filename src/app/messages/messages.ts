import { Component, ElementRef, OnInit, ViewChild, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Navbar } from '../navbar/navbar';
import { MessageService, Conversation } from '../message.service';
import { CallService } from '../call.service';

@Component({
  selector: 'app-messages',
  imports: [CommonModule, FormsModule, Navbar],
  templateUrl: './messages.html',
  styleUrl: './messages.css',
})
export class Messages implements OnInit {
  msgSvc  = inject(MessageService);
  callSvc = inject(CallService);
  route   = inject(ActivatedRoute);

  myId = Number(localStorage.getItem('userid') || 0);
  draft = '';
  partnerName = '';
  ctx: { itemId?: number; itemType?: string; itemName?: string } = {};

  conversations = this.msgSvc.conversations;
  messages      = this.msgSvc.activeMessages;
  activePartner = this.msgSvc.activePartner;

  @ViewChild('scrollBox') scrollBox?: ElementRef<HTMLDivElement>;

  constructor() {
    // Auto-scroll to the newest message whenever the thread changes.
    effect(() => { this.messages(); setTimeout(() => this.scrollToBottom(), 30); });
  }

  ngOnInit() {
    this.msgSvc.connect();
    this.msgSvc.loadConversations();

    this.route.queryParamMap.subscribe(q => {
      const to = q.get('to');
      if (to) {
        this.partnerName = q.get('name') || 'Conversation';
        this.ctx = {
          itemId:   q.get('itemId') ? Number(q.get('itemId')) : undefined,
          itemType: q.get('itemType') || undefined,
          itemName: q.get('itemName') || undefined,
        };
        this.msgSvc.loadConversation(Number(to));
      }
    });
  }

  openConversation(c: Conversation) {
    this.partnerName = c.partnerName;
    this.ctx = { itemName: c.itemName || undefined };
    this.msgSvc.loadConversation(c.partnerId);
  }

  send() {
    const partner = this.activePartner();
    if (!this.draft.trim() || partner == null) return;
    this.msgSvc.send(partner, this.draft, this.ctx);
    this.draft = '';
  }

  startCall(type: 'audio' | 'video') {
    const partner = this.activePartner();
    if (partner == null) return;
    this.callSvc.startCall(partner, this.partnerName, type);
  }

  initials(name: string): string {
    return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
  }

  private scrollToBottom() {
    const el = this.scrollBox?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
