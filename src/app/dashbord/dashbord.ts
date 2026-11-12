import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Navbar } from '../navbar/navbar';
import { MatchService } from '../match.service';
import { API_BASE, resolveImageUrl } from '../api';
import { categoryLabel, confidenceKey } from '../categories';
import { session } from '../session';

@Component({
  selector: 'app-dashbord',
  imports: [CommonModule, RouterModule, Navbar],
  templateUrl: './dashbord.html',
  styleUrl: './dashbord.css',
})
export class Dashbord implements OnInit {
  http = inject(HttpClient);
  matchSvc = inject(MatchService);
  username = session.name();
  stats = { lost: 0, found: 0, total: 0, mine: 0 };
  /** The strongest matches across all of the user's open reports. */
  topMatches: { m: any; myType: 'lost' | 'found'; myItemName: string }[] = [];
  recentItems: any[] = [];
  loadingMatches = true;
  loadingRecent  = true;
  loadFailed = false;
  categoryLabel = categoryLabel;
  confidenceKey = confidenceKey;

  ngOnInit() {
    const uid = session.userId();
    this.http.get<any>(`${API_BASE}/getUser/${uid}`).subscribe({
      next: u => {
        this.username = `${u.firstName || ''} ${u.lastName || ''}`.trim();
        session.setName(this.username);
      },
      error: () => {},
    });
    this.loadStats(uid);
    this.loadMatches();
  }

  loadStats(uid: number) {
    this.http.get<any>(`${API_BASE}/GetAllItem`).subscribe({
      next: data => {
        const lost  = data?.lost  || data?.Lost  || [];
        const found = data?.found || data?.Found || [];
        this.stats.lost  = lost.length;
        this.stats.found = found.length;
        this.stats.total = lost.length + found.length;
        this.stats.mine  = [...lost, ...found].filter((x: any) => x.userId === uid).length;
        this.recentItems = [...lost.map((x: any) => ({ ...x, type: 'lost' })), ...found.map((x: any) => ({ ...x, type: 'found' }))]
          .sort((a: any, b: any) => (b.id || 0) - (a.id || 0))
          .slice(0, 8);
        this.loadingRecent = false;
      },
      error: () => { this.loadingRecent = false; this.loadFailed = true; },
    });
  }

  private loadMatches() {
    this.matchSvc.refresh().subscribe({
      next: groups => {
        this.topMatches = groups
          .flatMap(g => g.matches.map(m => ({ m, myType: g.myItemType, myItemName: g.myItemName })))
          .sort((a, b) => (b.m.matchPercent || 0) - (a.m.matchPercent || 0))
          .slice(0, 5);
        this.loadingMatches = false;
      },
      error: () => { this.loadingMatches = false; },
    });
  }

  /** A match is always the other kind of report: my lost item matches a found one. */
  matchLink(t: { m: any; myType: 'lost' | 'found' }) {
    return ['/productDetails', t.myType === 'lost' ? 'found' : 'lost', t.m.id];
  }

  resolveImg(raw: string | undefined): string {
    return resolveImageUrl(raw);
  }
}
