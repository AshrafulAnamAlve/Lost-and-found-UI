import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatchService, MatchGroup, MatchItem, MatchReason } from '../match.service';
import { Navbar } from '../navbar/navbar';
import { resolveImageUrl } from '../api';

@Component({
  selector: 'app-matches',
  imports: [CommonModule, RouterModule, Navbar],
  templateUrl: './matches.html',
  styleUrl:    './matches.css',
})
export class Matches implements OnInit {
  matchSvc = inject(MatchService);
  router   = inject(Router);

  groups: MatchGroup[] = [];
  myId = Number(localStorage.getItem('userid') || 0);

  ngOnInit() {
    this.groups = this.matchSvc.groups();
    this.matchSvc.markAllSeen();
  }

  goToItem(type: string, id: number) {
    // opposite type — lost item → view found match, found item → view lost match
    const oppType = type === 'lost' ? 'found' : 'lost';
    this.router.navigate(['/productDetails', oppType, id]);
  }

  // Start an in-app chat with the owner of the matched item.
  chat(g: MatchGroup, m: MatchItem, ev: Event) {
    ev.stopPropagation(); // don't also open the item detail page
    if (!m.userId) return;
    const oppType = g.myItemType === 'lost' ? 'found' : 'lost';
    this.router.navigate(['/messages'], {
      queryParams: {
        to: m.userId,
        name: m.userName || 'User',
        itemId: m.id,
        itemType: oppType,
        itemName: m.itemName,
      },
    });
  }

  resolveImg(url: string | undefined): string {
    return resolveImageUrl(url);
  }

  pctClass(pct: number): string {
    if (pct >= 65) return 'high';
    if (pct >= 35) return 'med';
    return 'low';
  }

  /** The nature of the matched item, relative to the user's own item. */
  matchedKind(myItemType: 'lost' | 'found'): string {
    return myItemType === 'lost' ? 'found' : 'lost';
  }

  /** Plain-language one-liner shown on each match card. */
  matchSentence(g: MatchGroup, m: MatchItem): string {
    const mine  = g.myItemType === 'lost' ? 'lost' : 'found';
    const their = this.matchedKind(g.myItemType);
    return `This ${their} item matches your ${mine} “${g.myItemName}” with ${m.matchPercent}% confidence.`;
  }

  /** Normalised confidence bucket for styling/labels. */
  confKey(m: MatchItem): 'strong' | 'possible' | 'weak' {
    const c = (m.confidence || '').toLowerCase();
    if (c === 'strong')   return 'strong';
    if (c === 'possible') return 'possible';
    if (c === 'weak')     return 'weak';
    // Fallback from percentage if the API didn't send a label.
    if (m.matchPercent >= 72) return 'strong';
    if (m.matchPercent >= 55) return 'possible';
    return 'weak';
  }

  confLabel(m: MatchItem): string {
    return { strong: 'Strong match', possible: 'Possible match', weak: 'Weak match' }[this.confKey(m)];
  }

  reasonIcon(status: string): string {
    if (status === 'match')   return 'fa-circle-check';
    if (status === 'partial') return 'fa-circle-half-stroke';
    return 'fa-circle-xmark';
  }

  /** Positive signals first so the strongest reasons lead. */
  sortedReasons(m: MatchItem): MatchReason[] {
    const order: Record<string, number> = { match: 0, partial: 1, mismatch: 2 };
    return [...(m.matchReasons || [])].sort(
      (a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3)
    );
  }

  timeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  clearAll() { this.matchSvc.clear(); this.groups = []; }
}
