import { Component, ElementRef, HostListener, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MatchService } from '../match.service';
import { MessageService } from '../message.service';
import { UserService } from '../user.service';
import { API_BASE } from '../api';
import { session } from '../session';

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
  private http = inject(HttpClient);
  private el   = inject(ElementRef);
  displayName = session.name();
  menuOpen = false;

  ngOnInit() {
    if (!session.isLoggedIn()) return;

    // Open the realtime chat connection + load the unread badge.
    this.messageSvc.connect();
    this.messageSvc.loadUnreadCount();
    this.userSvc.loadOnce();

    // The name/role are cached at sign-in; fetch them if missing.
    if (!this.displayName || !localStorage.getItem('laf_role')) {
      this.http.get<any>(`${API_BASE}/getUser/${session.userId()}`).subscribe({
        next: (u) => {
          const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
          session.setName(name);
          if (u?.role) session.setRole(u.role);
          this.displayName = name;
        },
        error: () => {},
      });
    }

    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => (this.menuOpen = false));
  }

  /** First name only - the chip has little room. */
  get shortName(): string { return (this.displayName || '').split(' ')[0] || 'My profile'; }

  get isAdmin(): boolean { return session.isAdmin(); }
  get unseenCount() { return this.matchSvc.unseen(); }
  get msgUnread()   { return this.messageSvc.unreadCount(); }

  toggleMenu() { this.menuOpen = !this.menuOpen; }

  @HostListener('window:resize')
  onResize() { if (window.innerWidth > 900) this.menuOpen = false; }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.menuOpen && !this.el.nativeElement.contains(event.target)) {
      this.menuOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() { this.menuOpen = false; }

  logout() {
    this.messageSvc.disconnect();
    this.userSvc.clear();
    this.matchSvc.clear();
    session.clear();
    this.router.navigateByUrl('/login');
  }
}
