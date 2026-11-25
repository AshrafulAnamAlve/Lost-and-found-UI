import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, HostListener, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterModule } from '@angular/router';
import { ADMIN_API, resolveImageUrl } from '../api';
import { apiErrorMessage } from '../auth.interceptor';
import { categoryLabel } from '../categories';
import { Navbar } from '../navbar/navbar';

type AdminTab = 'overview' | 'users' | 'items' | 'reports';

@Component({
  selector: 'app-admin',
  imports: [CommonModule, FormsModule, RouterModule, Navbar],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  private http = inject(HttpClient);
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);

  tab: AdminTab = 'overview';
  loading = true;
  busy = false;

  overview: any = null;
  users: any[] = [];
  items: any[] = [];
  reports: any[] = [];

  userSearch = '';
  userFilter: 'all' | 'active' | 'blocked' = 'all';

  itemSearch = '';
  itemTypeFilter: 'all' | 'lost' | 'found' = 'all';
  itemStatusFilter: 'all' | 'open' | 'resolved' | 'reported' = 'all';

  reportFilter: 'pending' | 'reviewed' | 'dismissed' | 'all' = 'pending';

  blockingUser: any = null;
  blockReason = '';
  deletingItem: any = null;

  categoryLabel = categoryLabel;

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading = true;
    let done = 0;
    const tick = () => {
      done++;
      if (done >= 4) {
        this.loading = false;
        this.cdr.detectChanges();
      }
    };

    this.http.get<any>(`${ADMIN_API}/Overview`).subscribe({
      next: (res) => { this.overview = res; tick(); },
      error: (err) => { this.toastErr(err, 'Could not load overview.'); tick(); },
    });
    this.http.get<any[]>(`${ADMIN_API}/Users`).subscribe({
      next: (res) => { this.users = res || []; tick(); },
      error: (err) => { this.toastErr(err, 'Could not load users.'); tick(); },
    });
    this.http.get<any[]>(`${ADMIN_API}/Items`).subscribe({
      next: (res) => { this.items = res || []; tick(); },
      error: (err) => { this.toastErr(err, 'Could not load items.'); tick(); },
    });
    this.http.get<any[]>(`${ADMIN_API}/Reports`).subscribe({
      next: (res) => { this.reports = res || []; tick(); },
      error: (err) => { this.toastErr(err, 'Could not load reports.'); tick(); },
    });
  }

  get topContributors(): any[] {
    return [...this.users]
      .filter((u) => (u.role || '').toLowerCase() !== 'admin' || u.totalPosted > 0)
      .sort((a, b) => (b.totalPosted - a.totalPosted) || (b.totalResolved - a.totalResolved))
      .slice(0, 12);
  }

  get filteredUsers(): any[] {
    const q = this.userSearch.trim().toLowerCase();
    return this.users.filter((u) => {
      if (this.userFilter === 'active' && u.isBlocked) return false;
      if (this.userFilter === 'blocked' && !u.isBlocked) return false;
      if (!q) return true;
      return `${u.fullName} ${u.email} ${u.phone} ${u.city}`.toLowerCase().includes(q);
    });
  }

  get filteredItems(): any[] {
    const q = this.itemSearch.trim().toLowerCase();
    return this.items.filter((i) => {
      if (this.itemTypeFilter !== 'all' && i.type !== this.itemTypeFilter) return false;
      if (this.itemStatusFilter === 'open' && i.status === 'resolved') return false;
      if (this.itemStatusFilter === 'resolved' && i.status !== 'resolved') return false;
      if (this.itemStatusFilter === 'reported' && !i.reportsCount) return false;
      if (!q) return true;
      return `${i.itemName} ${i.category} ${i.location} ${i.userName} ${i.email}`.toLowerCase().includes(q);
    });
  }

  get filteredReports(): any[] {
    if (this.reportFilter === 'all') return this.reports;
    return this.reports.filter((r) => r.status === this.reportFilter);
  }

  get pendingReportsCount(): number {
    return this.reports.filter((r) => r.status === 'pending').length;
  }

  openBlockModal(user: any) {
    this.blockingUser = user;
    this.blockReason = '';
  }

  openBlockById(userId: number, fallbackName: string) {
    const existing = this.users.find((u) => u.id === userId);
    this.openBlockModal(existing || { id: userId, fullName: fallbackName, email: '' });
  }

  confirmBlock() {
    if (!this.blockingUser || this.busy) return;
    this.busy = true;
    this.http.post<any>(`${ADMIN_API}/Users/${this.blockingUser.id}/Block`, {
      reason: this.blockReason.trim() || null,
    }).subscribe({
      next: (res) => {
        this.busy = false;
        this.blockingUser = null;
        this.snackBar.open(res?.message || 'User blocked.', 'OK', { duration: 3500, verticalPosition: 'top' });
        this.loadAll();
      },
      error: (err) => { this.busy = false; this.toastErr(err, 'Could not block user.'); },
    });
  }

  unblockUser(user: any) {
    if (this.busy) return;
    this.busy = true;
    this.http.post<any>(`${ADMIN_API}/Users/${user.id}/Unblock`, {}).subscribe({
      next: (res) => {
        this.busy = false;
        this.snackBar.open(res?.message || 'User unblocked.', 'OK', { duration: 3500, verticalPosition: 'top' });
        this.loadAll();
      },
      error: (err) => { this.busy = false; this.toastErr(err, 'Could not unblock user.'); },
    });
  }

  openDeleteModal(item: any) {
    this.deletingItem = item;
  }

  confirmDeleteItem() {
    if (!this.deletingItem || this.busy) return;
    this.busy = true;
    this.http.delete<any>(`${ADMIN_API}/Items/${this.deletingItem.type}/${this.deletingItem.id}`).subscribe({
      next: (res) => {
        this.busy = false;
        this.deletingItem = null;
        this.snackBar.open(res?.message || 'Item deleted.', 'OK', { duration: 3500, verticalPosition: 'top' });
        this.loadAll();
      },
      error: (err) => { this.busy = false; this.toastErr(err, 'Could not delete item.'); },
    });
  }

  resolveReport(r: any, status: 'reviewed' | 'dismissed') {
    if (this.busy) return;
    this.busy = true;
    this.http.post<any>(`${ADMIN_API}/Reports/${r.id}/Resolve`, { status }).subscribe({
      next: (res) => {
        this.busy = false;
        this.snackBar.open(res?.message || 'Report updated.', 'OK', { duration: 3000, verticalPosition: 'top' });
        this.loadAll();
      },
      error: (err) => { this.busy = false; this.toastErr(err, 'Could not update report.'); },
    });
  }

  imgUrl(raw: string | null | undefined): string {
    return resolveImageUrl(raw);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.busy) return;
    this.blockingUser = null;
    this.deletingItem = null;
  }

  private toastErr(err: any, fallback: string) {
    this.snackBar.open(apiErrorMessage(err, fallback), 'OK', {
      duration: 5000, verticalPosition: 'top', panelClass: 'snack-error',
    });
  }
}
