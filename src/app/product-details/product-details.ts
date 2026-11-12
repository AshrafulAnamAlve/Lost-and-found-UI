import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { API_BASE as API, resolveImageUrl } from '../api';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ResolveItem } from '../resolve-item/resolve-item';
import { Navbar } from '../navbar/navbar';
import { MatchService } from '../match.service';
import { apiErrorMessage } from '../auth.interceptor';
import { categoryLabel, confidenceKey } from '../categories';
import { session } from '../session';

@Component({
  selector: 'app-product-details',
  imports: [CommonModule, RouterModule, ResolveItem, Navbar],
  templateUrl: './product-details.html',
  styleUrl: './product-details.css',
})
export class ProductDetails implements OnInit {
  item:           any    = null;
  itemType:       string = '';
  matches:        any[]  = [];
  matchesLoading         = true;
  selectedMatch:  any    = null; // opened in the side dialog
  notFound               = false;
  deleting               = false;

  http  = inject(HttpClient);
  route = inject(ActivatedRoute);
  cdr   = inject(ChangeDetectorRef);
  router = inject(Router);
  snackBar = inject(MatSnackBar);
  matchSvc = inject(MatchService);
  myId  = session.userId();
  categoryLabel = categoryLabel;
  confidenceKey = confidenceKey;

  // ── closing this report off ─────────────────────────────────────────────
  showResolve = false;

  /** Only the person who filed the report can change it — the API enforces this too. */
  get isMine(): boolean { return !!this.item && this.item.userId === this.myId; }
  get isResolved(): boolean { return this.item?.status === 'resolved'; }
  get reward(): string { return (this.item?.reward ?? this.item?.Reward ?? '').trim(); }
  get otherKind(): 'lost' | 'found' { return this.itemType === 'lost' ? 'found' : 'lost'; }

  onResolved(result: any) {
    this.showResolve = false;
    if (!this.item) return;
    Object.assign(this.item, {
      status: 'resolved',
      resolvedAt: result?.resolvedAt ?? new Date().toISOString(),
      resolvedWithUserId: result?.resolvedWithUserId ?? null,
      resolvedWithItemId: result?.resolvedWithItemId ?? null,
      resolvedNote: result?.resolvedNote ?? null,
    });
    this.matchSvc.removeGroup(this.item.id, this.item.type);
    this.cdr.detectChanges();
  }

  reopen() {
    this.http.post<any>(`${API}/Reopen`, { type: this.item.type, id: this.item.id }).subscribe({
      next: () => {
        Object.assign(this.item, { status: 'open', resolvedAt: null, resolvedWithUserId: null, resolvedWithItemId: null, resolvedNote: null });
        this.snackBar.open('Report reopened. It is back in matching.', 'OK', { duration: 3500, verticalPosition: 'top' });
        this.cdr.detectChanges();
      },
      error: (err) => this.snackBar.open(apiErrorMessage(err, 'Could not reopen this report.'), 'OK',
        { duration: 5000, verticalPosition: 'top', panelClass: 'snack-error' }),
    });
  }

  editItem() {
    this.router.navigate([`/${this.item.type}/edit`, this.item.id]);
  }

  deleteItem() {
    if (this.deleting) return;
    if (!confirm(`Delete "${this.item.itemName}"? This cannot be undone.`)) return;
    this.deleting = true;
    this.http.delete(`${API}/Delete/${this.item.type}/${this.item.id}`).subscribe({
      next: () => {
        this.matchSvc.removeGroup(this.item.id, this.item.type);
        this.snackBar.open('Report deleted.', 'OK', { duration: 3500, verticalPosition: 'top' });
        this.router.navigateByUrl('/profile');
      },
      error: (err) => {
        this.deleting = false;
        this.snackBar.open(apiErrorMessage(err, 'Could not delete this report.'), 'OK',
          { duration: 5000, verticalPosition: 'top', panelClass: 'snack-error' });
      },
    });
  }

  /** Opens the in-app chat with a user (the reporter of this item, or of a match). */
  chatWith(userId: number, name: string, itemId: number, itemType: string, itemName: string) {
    if (!userId) return;
    this.router.navigate(['/messages'], {
      queryParams: { to: userId, name: name || 'User', itemId, itemType, itemName },
    });
  }

  /** A mailto link with a subject that says which report this is about. */
  mailLink(email: string, itemName: string, theirKind: string): string {
    const subject = encodeURIComponent(`About your ${theirKind} item "${itemName}" on Lost & Found BUBT`);
    return `mailto:${email}?subject=${subject}`;
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const type = (params.get('type') ?? '').toLowerCase();
      const id   = params.get('id');
      if (type && id) {
        this.itemType      = type;
        this.item          = null;
        this.notFound      = false;
        this.matches       = [];
        this.selectedMatch = null;
        this.matchesLoading = true;
        this.loadItem(type, +id);
      }
    });
  }

  loadItem(type: string, id: number) {
    this.http.get<any>(`${API}/GetItemById/${type}/${id}`).subscribe({
      next: res => {
        res.image = resolveImageUrl(res.imageUrl);
        res.type  = type;
        this.item = res;
        this.cdr.detectChanges();
        this.loadMatches(type, id);
      },
      error: (err) => {
        if (err?.status === 401) return;   // the interceptor sends them to sign in
        this.notFound = true;
        this.cdr.detectChanges();
      },
    });
  }

  loadMatches(type: string, id: number) {
    const ep = type === 'lost' ? `GetMatchesForLost/${id}` : `GetMatchesForFound/${id}`;
    this.http.get<any>(`${API}/${ep}`).subscribe({
      next:  res => { this.matches = res.suggestedMatches ?? []; this.matchesLoading = false; this.cdr.detectChanges(); },
      error: ()  => { this.matches = []; this.matchesLoading = false; this.cdr.detectChanges(); }
    });
  }

  openMatch(m: any) {
    this.selectedMatch = m;
    document.body.style.overflow = 'hidden';
  }

  closeMatch() {
    this.selectedMatch = null;
    document.body.style.overflow = '';
  }

  @HostListener('document:keydown.escape')
  onEscape() { if (this.selectedMatch) this.closeMatch(); }

  /** Opens the matched item's own page. */
  goToMatchPage() {
    if (!this.selectedMatch) return;
    this.router.navigate(['/productDetails', this.otherKind, this.selectedMatch.id]);
    this.closeMatch();
  }

  pctClass(m: any) { return { strong: 'high', possible: 'med', weak: 'low' }[confidenceKey(m)]; }

  confLabel(m: any) { return { strong: 'Strong match', possible: 'Possible match', weak: 'Weak match' }[confidenceKey(m)]; }

  reasonIcon(status: string): string {
    if (status === 'match')   return 'fa-circle-check';
    if (status === 'partial') return 'fa-circle-half-stroke';
    return 'fa-circle-xmark';
  }

  resolveImg(raw: string | null | undefined): string {
    return resolveImageUrl(raw);
  }

  imgError(e: any) { e.target.style.display = 'none'; }

  goBack() {
    const ref = this.route.snapshot.queryParamMap.get('ref');
    if (ref === 'profile') { this.router.navigateByUrl('/profile'); return; }
    if (window.history.length > 1) { window.history.back(); return; }
    this.router.navigateByUrl('/reports');
  }
}
