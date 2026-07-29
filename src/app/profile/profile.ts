import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Navbar } from '../navbar/navbar';
import { HttpClient } from '@angular/common/http';
import { API_ORIGIN } from '../api';
import { MatchItem, MatchReason } from '../match.service';

interface ProfileMatchGroup {
  itemId: number;
  itemName: string;
  type: 'lost' | 'found';
  matches: MatchItem[];
}

@Component({
  selector: 'app-profile',
  imports: [CommonModule, Navbar, RouterModule],
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

  // Profile picture upload
  @ViewChild('avatarInput') avatarInput!: ElementRef<HTMLInputElement>;
  uploadingAvatar = false;

  http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

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
  /** Current avatar: the user's uploaded picture, or a friendly default. */
  avatarUrl(): string {
    const raw = this.user?.imageUrl;
    return raw ? this.resolveImg(raw) : 'https://i.pravatar.cc/300';
  }

  triggerAvatarUpload() { this.avatarInput?.nativeElement.click(); }

  onAvatarSelected(e: any) {
    const file: File | undefined = e?.target?.files?.[0];
    if (file && file.type.startsWith('image')) this.uploadAvatar(file);
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
        this.uploadingAvatar = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.uploadingAvatar = false;
        alert('Could not upload the picture. Please try again.');
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
