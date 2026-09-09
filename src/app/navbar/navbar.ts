import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatchService } from '../match.service';
import { MessageService } from '../message.service';
import { UserService } from '../user.service';

@Component({
  selector: 'app-navbar',
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar implements OnInit {
  matchSvc    = inject(MatchService);
  messageSvc  = inject(MessageService);
  userSvc     = inject(UserService);
  router      = inject(Router);
  displayName = '';

  ngOnInit() {
    const uid = localStorage.getItem('userid');
    if (uid) {
      const cached = localStorage.getItem('username');
      if (cached) this.displayName = cached;
      // Open the realtime chat connection + load the unread badge.
      this.messageSvc.connect();
      this.messageSvc.loadUnreadCount();
      // Their own picture in the corner, cached so it paints straight away.
      this.userSvc.loadOnce();
    }
  }

  get unseenCount() { return this.matchSvc.unseen(); }
  get msgUnread()   { return this.messageSvc.unreadCount(); }

  goToMatches() {
    this.router.navigateByUrl('/matches');
  }

  logout() {
    this.messageSvc.disconnect();
    this.userSvc.clear();
    localStorage.clear();
    this.router.navigateByUrl('/login');
  }
}
