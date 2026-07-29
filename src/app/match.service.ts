import { Injectable, signal, computed } from '@angular/core';

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

  private load(): MatchGroup[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }
  private save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._groups())); } catch {}
  }
}
