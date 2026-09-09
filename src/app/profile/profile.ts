import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Navbar } from '../navbar/navbar';
import { HttpClient } from '@angular/common/http';
import { API_ORIGIN } from '../api';
import { MatchItem, MatchReason } from '../match.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserService } from '../user.service';
import { ResolveItem } from '../resolve-item/resolve-item';

interface ProfileMatchGroup {
  itemId: number;
  itemName: string;
  type: 'lost' | 'found';
  matches: MatchItem[];
}

@Component({
  selector: 'app-profile',
  imports: [CommonModule, Navbar, RouterModule, ResolveItem],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit{
user: any;
  // raw arrays returned from API (may not be normalized)
  lost: any[] = [];
  found: any[] = [];
  // combined, normalized list used for rendering cards
  userItems: any[] = [];

  // AI match summaries for the user's items
  aiGroups: ProfileMatchGroup[] = [];
  loadingMatches = true;

  // ── Profile picture ────────────────────────────────────────────────────────
  @ViewChild('avatarInput') avatarInput!: ElementRef<HTMLInputElement>;
  uploadingAvatar = false;
  avatarDragging = false;

  /** Shown the instant a file is picked, so the circle never sits empty while uploading. */
  avatarPreview: string | null = null;

  private static readonly MAX_AVATAR_BYTES = 5 * 1024 * 1024;
  private static readonly ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private userSvc = inject(UserService);

  ngOnInit(): void {
    const id = localStorage.getItem("userid");
    if (id) {
      this.getUser(+id);
      this.getUserItem(+id);
    }
  }

  getUser(id: number) {
    this.http.get<any>(`${API_ORIGIN}/api/LostAndFound/getUser/${id}`).subscribe({
      next: (res) => {
        this.user = res;
        this.cdr.detectChanges();
      },
      error: (err) => {
        alert(err.error);
      }
    });
  }

  /** convert raw lost/found entries into unified shape used by cards */
  private normalizeItems(lostArr: any[], foundArr: any[]) {
    const resolveImage = (raw: string | undefined | null, type: string): string => {
      const placeholder =
        "data:image/svg+xml;charset=UTF-8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><rect width='150' height='150' fill='%23ccc'/><text x='50%' y='50%' alignment-baseline='middle' text-anchor='middle' fill='%23666' font-size='14'>No Image</text></svg>";
      if (!raw) return placeholder;
      if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
      let path: string;
      if (!raw.includes('/')) {
        path = `/uploads/${type}/${raw}`;
      } else {
        path = raw.startsWith('/') ? raw : '/' + raw;
      }
      const encoded = path
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/');
      return API_ORIGIN + encoded;
    };

    const lost = (lostArr || []).map((l: any) => {
      return {
        ...l,
        type: 'lost',
        title: l.itemName || l.title || '',
        date: l.dateLost || l.date || null,
        location: l.location || '',
        image: resolveImage(l.imageUrl || l.image, 'lost')
      };
    });

    const found = (foundArr || []).map((f: any) => {
      return {
        ...f,
        type: 'found',
        title: f.itemName || f.title || '',
        date: f.dateFound || f.date || null,
        location: f.location || '',
        image: resolveImage(f.imageUrl || f.image, 'found')
      };
    });

    const all = [...lost, ...found];
    // newest first if id present
    all.sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
    return all;
  }

  getUserItem(id: number) {
    this.http
      .get<any>(`${API_ORIGIN}/api/LostAndFound/GetUserItems/${id}`)
      .subscribe({
        next: (res) => {
          this.lost = res.lost || [];
          this.found = res.found || [];
          this.userItems = this.normalizeItems(this.lost, this.found);
          this.loadMatches();
          this.cdr.detectChanges();
        },
        error: (err) => {
          alert(err + "User Item not problem");
        }
      });
  }

  /** Fetch AI matches for every item the user posted and keep only ones that matched. */
  private loadMatches() {
    const base = `${API_ORIGIN}/api/LostAndFound`;
    const calls = [
      ...this.lost.map(it => this.http.get<any>(`${base}/GetMatchesForLost/${it.id}`).pipe(
        map(r => ({ itemId: it.id, itemName: it.itemName, type: 'lost' as const, matches: (r?.suggestedMatches ?? []) as MatchItem[] })),
        catchError(() => of({ itemId: it.id, itemName: it.itemName, type: 'lost' as const, matches: [] as MatchItem[] })))),
      ...this.found.map(it => this.http.get<any>(`${base}/GetMatchesForFound/${it.id}`).pipe(
        map(r => ({ itemId: it.id, itemName: it.itemName, type: 'found' as const, matches: (r?.suggestedMatches ?? []) as MatchItem[] })),
        catchError(() => of({ itemId: it.id, itemName: it.itemName, type: 'found' as const, matches: [] as MatchItem[] })))),
    ];

    if (calls.length === 0) { this.loadingMatches = false; return; }

    forkJoin(calls).subscribe(results => {
      this.aiGroups = results
        .filter(r => r.matches.length > 0)
        .sort((a, b) => (b.matches[0]?.matchPercent || 0) - (a.matches[0]?.matchPercent || 0));
      this.loadingMatches = false;
      this.cdr.detectChanges();
    });
  }

  // ── match display helpers ───────────────────────────────────────────────
  matchedKind(type: 'lost' | 'found'): string { return type === 'lost' ? 'found' : 'lost'; }

  confKey(m: MatchItem): 'strong' | 'possible' | 'weak' {
    const c = (m.confidence || '').toLowerCase();
    if (c === 'strong' || c === 'possible' || c === 'weak') return c as any;
    if (m.matchPercent >= 72) return 'strong';
    if (m.matchPercent >= 55) return 'possible';
    return 'weak';
  }
  confLabel(m: MatchItem): string {
    return { strong: 'Strong match', possible: 'Possible match', weak: 'Weak match' }[this.confKey(m)];
  }

  /** Top positive signals, capped so the summary stays compact. */
  topReasons(m: MatchItem, limit = 4): MatchReason[] {
    const order: Record<string, number> = { match: 0, partial: 1, mismatch: 2 };
    return [...(m.matchReasons || [])]
      .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3))
      .slice(0, limit);
  }
  reasonIcon(status: string): string {
    if (status === 'match')   return 'fa-circle-check';
    if (status === 'partial') return 'fa-circle-half-stroke';
    return 'fa-circle-xmark';
  }

  resolveImg(raw: string | undefined): string {
    if (!raw) return '';
    if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
    return `${API_ORIGIN}${raw}`;
  }

  viewMatch(type: 'lost' | 'found', id: number) {
    this.router.navigate(['/productDetails', this.matchedKind(type), id]);
  }

  // ── profile picture ─────────────────────────────────────────────────────

  /**
   * The picture to draw: the local preview while an upload is in flight, then the
   * stored one. Empty means the user has never uploaded a photo — the template
   * draws their initials rather than a stock face, so "no photo yet" is obvious.
   */
  get avatarSrc(): string {
    if (this.avatarPreview) return this.avatarPreview;
    return this.user?.imageUrl ? this.resolveImg(this.user.imageUrl) : '';
  }

  /** Initials for the placeholder circle. */
  get initials(): string {
    const first = (this.user?.firstName || '').trim();
    const last  = (this.user?.lastName  || '').trim();
    return ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
  }

  triggerAvatarUpload() {
    if (!this.uploadingAvatar) this.avatarInput?.nativeElement.click();
  }

  onAvatarSelected(e: any) {
    const file: File | undefined = e?.target?.files?.[0];
    if (file) this.chooseAvatar(file);
    // Clear it, or picking the same file twice in a row raises no change event.
    if (e?.target) e.target.value = '';
  }

  onAvatarDragOver(e: DragEvent) { e.preventDefault(); this.avatarDragging = true; }
  onAvatarDragLeave()            { this.avatarDragging = false; }
  onAvatarDrop(e: DragEvent) {
    e.preventDefault();
    this.avatarDragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) this.chooseAvatar(file);
  }

  /** Checks the file before it goes anywhere, then shows it while it uploads. */
  private chooseAvatar(file: File) {
    if (!Profile.ALLOWED_TYPES.includes(file.type)) {
      this.notify('Choose a JPG, PNG, WebP or GIF image');
      return;
    }
    if (file.size > Profile.MAX_AVATAR_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      this.notify(`That image is ${mb} MB — please choose one under 5 MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => { this.avatarPreview = reader.result as string; this.cdr.detectChanges(); };
    reader.readAsDataURL(file);

    this.uploadAvatar(file);
  }

  private uploadAvatar(file: File) {
    const id = localStorage.getItem('userid');
    if (!id) return;

    this.uploadingAvatar = true;
    const fd = new FormData();
    fd.append('image', file, file.name);

    this.http.post<any>(`${API_ORIGIN}/api/LostAndFound/UploadImage/user/${id}`, fd).subscribe({
      next: (res) => {
        // Append a cache-buster so the <img> refreshes immediately.
        if (this.user) this.user.imageUrl = `${res.imageUrl}?t=${Date.now()}`;
        this.userSvc.setAvatar(res.imageUrl);   // the navbar shows it too
        this.avatarPreview = null;
        this.uploadingAvatar = false;
        this.notify('Profile picture updated');
        this.cdr.detectChanges();
      },
      error: () => {
        this.avatarPreview = null;              // keep showing what is actually saved
        this.uploadingAvatar = false;
        this.notify('Could not upload the picture. Please try again.');
        this.cdr.detectChanges();
      },
    });
  }

  private notify(message: string) {
    this.snackBar.open(message, 'Ok', { duration: 4000, verticalPosition: 'top' });
  }

  // ── closing a report off ────────────────────────────────────────────────

  /** The item whose "mark as returned" dialog is open, if any. */
  resolving: any = null;

  isResolved(item: any): boolean { return item?.status === 'resolved'; }

  /** The AI's suggestions for this item — offered as who it might have gone to. */
  matchesFor(item: any): MatchItem[] {
    return this.aiGroups.find((g) => g.itemId === item.id && g.type === item.type)?.matches ?? [];
  }

  openResolve(item: any) { this.resolving = item; }
  closeResolve()         { this.resolving = null; }

  onResolved(result: any) {
    const item = this.resolving;
    this.resolving = null;
    if (!item) return;

    Object.assign(item, {
      status: 'resolved',
      resolvedAt: result?.resolvedAt ?? new Date().toISOString(),
      resolvedWithUserId: result?.resolvedWithUserId ?? null,
      resolvedWithItemId: result?.resolvedWithItemId ?? null,
      resolvedNote: result?.resolvedNote ?? null,
    });
    this.cdr.detectChanges();
  }

  /** Undo — a report closed by mistake must not be stuck that way. */
  reopenItem(item: any) {
    this.http.post<any>(`${API_ORIGIN}/api/LostAndFound/Reopen`, {
      type: item.type,
      id: item.id,
      userId: Number(localStorage.getItem('userid') || 0),
    }).subscribe({
      next: () => {
        Object.assign(item, { status: 'open', resolvedAt: null, resolvedWithUserId: null, resolvedWithItemId: null, resolvedNote: null });
        this.snackBar.open('Report reopened — it is back in matching', 'Ok', { duration: 3500, verticalPosition: 'top' });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.snackBar.open(err?.error?.message || 'Could not reopen this report', 'Ok', { duration: 4000, verticalPosition: 'top' });
      },
    });
  }

  /** handlers for edit/delete buttons */
  editItem(item: any) {
    console.log('edit clicked', item);
    // navigate to detail page or edit form
    this.router.navigate(['/productDetails', item.type, item.id]);
  }

  deleteItem(item: any) {
    if (confirm('Are you sure you want to delete this item?')) {
      this.http
        .delete(`${API_ORIGIN}/api/LostAndFound/Delete/${item.type}/${item.id}`)
        .subscribe({
          next: () => {
            this.userItems = this.userItems.filter((i) => i.id !== item.id);
            this.cdr.detectChanges();
          },
          error: (err) => alert(err)
        });
    }
  }

  imgError(event: any) {
    const tgt = event.target as HTMLImageElement;
    tgt.src = "data:image/svg+xml;charset=UTF-8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><rect width='150' height='150' fill='%23ccc'/><text x='50%' y='50%' alignment-baseline='middle' text-anchor='middle' fill='%23666' font-size='14'>No Image</text></svg>";
  }

}
