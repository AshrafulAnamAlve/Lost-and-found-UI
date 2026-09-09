import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { API_BASE as API, resolveImageUrl } from '../api';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ResolveItem } from '../resolve-item/resolve-item';

@Component({
  selector: 'app-product-details',
  imports: [CommonModule, FormsModule, ResolveItem],
  templateUrl: './product-details.html',
  styleUrl: './product-details.css',
})
export class ProductDetails implements OnInit {
  item:           any    = null;
  itemType:       string = '';
  matches:        any[]  = [];
  matchesLoading         = true;
  selectedMatch:  any    = null; // opened in side panel
  contactMessage         = '';
  msgSent                = false;

  http  = inject(HttpClient);
  route = inject(ActivatedRoute);
  cdr   = inject(ChangeDetectorRef);
  myId  = Number(localStorage.getItem('userid') || 0);
  snackBar = inject(MatSnackBar);
  constructor(private router: Router) {}

  // ── closing this report off ─────────────────────────────────────────────
  showResolve = false;

  /** Only the person who filed the report can close it — the API enforces this too. */
  get isMine(): boolean { return !!this.item && this.item.userId === this.myId; }
  get isResolved(): boolean { return this.item?.status === 'resolved'; }

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
    this.cdr.detectChanges();
  }

  reopen() {
    this.http.post<any>(`${API}/Reopen`, {
      type: this.item.type,
      id: this.item.id,
      userId: this.myId,
    }).subscribe({
      next: () => {
        Object.assign(this.item, { status: 'open', resolvedAt: null, resolvedWithUserId: null, resolvedWithItemId: null, resolvedNote: null });
        this.snackBar.open('Report reopened — it is back in matching', 'Ok', { duration: 3500, verticalPosition: 'top' });
        this.cdr.detectChanges();
      },
      error: (err) => this.snackBar.open(err?.error?.message || 'Could not reopen this report', 'Ok', { duration: 4000, verticalPosition: 'top' }),
    });
  }

  // Open the in-app chat with a user (item owner or a match owner).
  chatWith(userId: number, name: string, itemId: number, itemType: string, itemName: string) {
    if (!userId) return;
    this.router.navigate(['/messages'], {
      queryParams: { to: userId, name: name || 'User', itemId, itemType, itemName },
    });
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const type = params.get('type') ?? '';
      const id   = params.get('id');
      if (type && id) {
        this.itemType      = type;
        this.item          = null;
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
        res.image = this.resolveImg(res.imageUrl, type);
        res.type  = type;
        this.item = res;
        this.cdr.detectChanges();
        this.loadMatches(type, id);
      },
      error: () => this.router.navigateByUrl('/reports')
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
    this.selectedMatch  = m;
    this.contactMessage = '';
    this.msgSent        = false;
    document.body.style.overflow = 'hidden';
  }

  closeMatch() {
    this.selectedMatch = null;
    document.body.style.overflow = '';
  }

  // Navigate to the matched item's own detail page
  goToMatchPage() {
    if (!this.selectedMatch) return;
    const oppType = this.itemType === 'lost' ? 'found' : 'lost';
    this.router.navigate(['/productDetails', oppType, this.selectedMatch.id]);
    this.closeMatch();
  }

  sendContact() {
    if (!this.contactMessage.trim()) return;
    // Opens mail client pre-filled
    const to      = this.selectedMatch?.email ?? '';
    const subject = encodeURIComponent(`Regarding your ${this.itemType === 'lost' ? 'found' : 'lost'} item: ${this.selectedMatch?.itemName}`);
    const body    = encodeURIComponent(this.contactMessage);
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
    this.msgSent = true;
  }

  callContact() {
    const phone = this.selectedMatch?.phoneNumber;
    if (phone) window.open(`tel:${phone}`, '_self');
  }

  pctClass(p: number) { return p >= 65 ? 'high' : p >= 35 ? 'med' : 'low'; }

  resolveImg(raw: string | null | undefined, type?: string): string {
    return resolveImageUrl(raw);
  }

  imgError(e: any) { e.target.style.display = 'none'; }

  goBack() {
    const ref = this.route.snapshot.queryParamMap.get('ref');
    this.router.navigateByUrl(ref === 'profile' ? '/profile' : '/reports');
  }
}
