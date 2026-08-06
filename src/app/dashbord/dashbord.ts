import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Navbar } from '../navbar/navbar';
import { MatchService } from '../match.service';
import { API_BASE, resolveImageUrl } from '../api';

@Component({
  selector: 'app-dashbord',
  imports: [CommonModule, RouterModule, Navbar],
  templateUrl: './dashbord.html',
  styleUrl: './dashbord.css',
})
export class Dashbord implements OnInit {
  http = inject(HttpClient);
  matchSvc = inject(MatchService);
  username = '';
  stats = { lost: 0, found: 0, total: 0, mine: 0 };
  aiMatches: any[] = [];
  recentItems: any[] = [];
  loadingMatches = true;
  loadingRecent  = true;

  ngOnInit() {
    const uid = localStorage.getItem('userid');
    if (uid) {
      this.http.get<any>(`${API_BASE}/getUser/${uid}`).subscribe({
        next: u => { this.username = `${u.firstName || ''} ${u.lastName || ''}`.trim(); }
      });
    }
    this.loadStats(uid);
  }

  loadStats(uid: string | null) {
    this.http.get<any>(`${API_BASE}/GetAllItem`).subscribe({
      next: data => {
        const lost  = data?.lost  || data?.Lost  || [];
        const found = data?.found || data?.Found || [];
        this.stats.lost  = lost.length;
        this.stats.found = found.length;
        this.stats.total = lost.length + found.length;
        if (uid) {
          this.stats.mine = [...lost, ...found].filter(x =>
            String(x.userId || x.userid || x.UserId) === String(uid)
          ).length;
        }
        const all = [...lost.map((x: any) => ({...x, type:'lost'})), ...found.map((x: any) => ({...x, type:'found'}))]
          .sort((a: any, b: any) => (b.id||0)-(a.id||0));
        this.recentItems = all.slice(0, 8);
        this.loadingRecent = false;

        // Load AI matches for ALL of the user's items and feed the notification
        // service, so the bell reflects real matches (not just this session's).
        if (uid) {
          const mine = (arr: any[]) => arr.filter((x: any) =>
            String(x.userId || x.userid || x.UserId) === String(uid));
          this.loadAllMatches(mine(lost), mine(found));
        } else {
          this.loadingMatches = false;
        }
      },
      error: () => { this.loadingRecent = false; this.loadingMatches = false; }
    });
  }

  resolveImg(raw: string | undefined): string {
    return resolveImageUrl(raw);
  }

  private loadAllMatches(myLost: any[], myFound: any[]) {
    const base = API_BASE;
    const calls = [
      ...myLost.map(it => this.http.get<any>(`${base}/GetMatchesForLost/${it.id}`).pipe(
        map(r => ({ it, type: 'lost' as const, matches: r?.suggestedMatches ?? [] })),
        catchError(() => of({ it, type: 'lost' as const, matches: [] as any[] })))),
      ...myFound.map(it => this.http.get<any>(`${base}/GetMatchesForFound/${it.id}`).pipe(
        map(r => ({ it, type: 'found' as const, matches: r?.suggestedMatches ?? [] })),
        catchError(() => of({ it, type: 'found' as const, matches: [] as any[] })))),
    ];

    if (calls.length === 0) { this.loadingMatches = false; return; }

    forkJoin(calls).subscribe(results => {
      for (const r of results) {
        if (r.matches.length) {
          this.matchSvc.syncMatches(r.it.id, r.it.itemName, r.type, r.matches);
        }
      }
      // Inline panel keeps showing the user's first lost item's matches (lost -> found).
      const firstLost = results.find(r => r.type === 'lost' && r.matches.length);
      this.aiMatches = firstLost ? firstLost.matches : [];
      this.loadingMatches = false;
    });
  }
}
