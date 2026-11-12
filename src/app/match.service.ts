import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { API_BASE } from './api';
import { session } from './session';

/** A single explainable signal behind a match, e.g. "Brand matches: Apple". */
export interface MatchReason {
  field: string;
  label: string;
  status: 'match' | 'partial' | 'mismatch';
  detail?: string;
}

export interface MatchItem {
  id: number;
  userId?: number;
  itemName: string;
  category?: string;
  description?: string;
  location?: string;
  brand?: string;
  color?: string;
  imageUrl?: string;
  userName?: string;
  phoneNumber?: string;
  email?: string;
  dateFound?: string;
  dateLost?: string;
  matchPercent: number;
  confidence?: 'Strong' | 'Possible' | 'Weak' | string;
  matchReasons?: MatchReason[];
}

export interface MatchGroup {
  myItemId: number;
  myItemName: string;
  myItemType: 'lost' | 'found'; // 'lost' means I lost it, matches are found items
  timestamp: number;
  seen: boolean;
  matches: MatchItem[];
}

const STORAGE_KEY = 'laf_match_groups';

@Injectable({ providedIn: 'root' })
export class MatchService {
  private http = inject(HttpClient);
  private _groups = signal<MatchGroup[]>(this.load());

  readonly groups   = this._groups.asReadonly();
  readonly unseen   = computed(() => this._groups().filter(g => !g.seen).length);

  /** Called right after lost/found submit with the API response matches */
  addMatches(myItemId: number, myItemName: string, myItemType: 'lost' | 'found', matches: MatchItem[]) {
    if (!matches?.length) return;
    const group: MatchGroup = { myItemId, myItemName, myItemType, matches, timestamp: Date.now(), seen: false };
    this._groups.update(prev => {
      // replace if same item already has a group
      const filtered = prev.filter(g => !(g.myItemId === myItemId && g.myItemType === myItemType));
      return [group, ...filtered];
    });
    this.save();
  }

  /** Sync matches for one of the user's existing items (e.g. on dashboard load).
   *  Keeps the group's 'seen' flag if the same matches were already recorded,
   *  so the bell only re-notifies when the match set actually changes. */
  syncMatches(myItemId: number, myItemName: string, myItemType: 'lost' | 'found', matches: MatchItem[]) {
    if (!matches?.length) return;
    const sig = (arr: MatchItem[]) => arr.map(m => m.id).sort((a, b) => a - b).join(',');
    this._groups.update(prev => {
      const existing = prev.find(g => g.myItemId === myItemId && g.myItemType === myItemType);
      const seen = !!existing && sig(existing.matches) === sig(matches) ? existing.seen : false;
      const group: MatchGroup = {
        myItemId, myItemName, myItemType, matches, seen,
        timestamp: existing?.timestamp ?? Date.now(),
      };
      const filtered = prev.filter(g => !(g.myItemId === myItemId && g.myItemType === myItemType));
      return [group, ...filtered];
    });
    this.save();
  }

  markAllSeen() {
    this._groups.update(prev => prev.map(g => ({ ...g, seen: true })));
    this.save();
  }

  clear() { this._groups.set([]); this.save(); }

  /** Forgets one of the user's items - it was deleted, or no longer has any match. */
  removeGroup(myItemId: number, myItemType: 'lost' | 'found') {
    this._groups.update(prev => prev.filter(g => !(g.myItemId === myItemId && g.myItemType === myItemType)));
    this.save();
  }

  /**
   * Rebuilds the list from the server: every open report the user owns, with its
   * current matches. Reports that were deleted, closed, or lost their matches drop
   * out, so the bell and the matches page never point at something that is gone.
   * Emits the fresh groups (also stored), best match first.
   */
  refresh(): Observable<MatchGroup[]> {
    const uid = session.userId();
    if (!uid) return of([]);

    return new Observable<MatchGroup[]>(subscriber => {
      this.http.get<any>(`${API_BASE}/GetUserItems/${uid}`).subscribe({
        next: res => {
          const open = (x: any) => x.status !== 'resolved';
          const lost  = (res?.lost  ?? res?.Lost  ?? []).filter(open);
          const found = (res?.found ?? res?.Found ?? []).filter(open);
          const calls = [
            ...lost.map((it: any) => this.http.get<any>(`${API_BASE}/GetMatchesForLost/${it.id}`).pipe(
              map(r => ({ it, type: 'lost' as const, matches: (r?.suggestedMatches ?? []) as MatchItem[] })),
              catchError(() => of({ it, type: 'lost' as const, matches: [] as MatchItem[] })))),
            ...found.map((it: any) => this.http.get<any>(`${API_BASE}/GetMatchesForFound/${it.id}`).pipe(
              map(r => ({ it, type: 'found' as const, matches: (r?.suggestedMatches ?? []) as MatchItem[] })),
              catchError(() => of({ it, type: 'found' as const, matches: [] as MatchItem[] })))),
          ];

          const finish = (results: { it: any; type: 'lost' | 'found'; matches: MatchItem[] }[]) => {
            const sig = (arr: MatchItem[]) => arr.map(m => m.id).sort((a, b) => a - b).join(',');
            const previous = this._groups();
            const groups: MatchGroup[] = results
              .filter(r => r.matches.length > 0)
              .map(r => {
                const existing = previous.find(g => g.myItemId === r.it.id && g.myItemType === r.type);
                return {
                  myItemId: r.it.id, myItemName: r.it.itemName, myItemType: r.type, matches: r.matches,
                  seen: !!existing && sig(existing.matches) === sig(r.matches) ? existing.seen : false,
                  timestamp: existing?.timestamp ?? Date.now(),
                };
              })
              .sort((a, b) => (b.matches[0]?.matchPercent || 0) - (a.matches[0]?.matchPercent || 0));
            this._groups.set(groups);
            this.save();
            subscriber.next(groups);
            subscriber.complete();
          };

          if (calls.length === 0) finish([]);
          else forkJoin(calls).subscribe({ next: finish, error: e => subscriber.error(e) });
        },
        error: e => subscriber.error(e),
      });
    });
  }

  private load(): MatchGroup[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }
  private save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._groups())); } catch {}
  }
}
