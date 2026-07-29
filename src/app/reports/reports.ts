import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Navbar } from '../navbar/navbar';
import { API_ORIGIN } from '../api';

@Component({
  selector: 'app-reports',
  imports: [CommonModule, FormsModule, Navbar, RouterModule],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class Reports implements OnInit {
  activeTab: 'all' | 'lost' | 'found' = 'all';
  loading = true;
  http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  filters = { keyword: '', category: '', location: '' };
  items: any[] = [];
  filteredItems: any[] = [];
  uniqueLocations: string[] = [];

  ngOnInit() { this.getAllItem(); }

  private resolveImage(raw: string | undefined | null, type: string): string | null {
    if (!raw) return null;
    if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
    const path = raw.startsWith('/') ? raw : `/uploads/${type}/${raw}`;
    return API_ORIGIN + path.split('/').map(s => encodeURIComponent(s)).join('/');
  }

  getAllItem() {
    this.loading = true;
    this.http.get<any>(`${API_ORIGIN}/api/LostAndFound/GetAllItem`).subscribe({
      next: (res) => {
        const lostArr  = res?.lost  || res?.Lost  || [];
        const foundArr = res?.found || res?.Found || [];
        const lost  = lostArr.map((l: any)  => ({ ...l,  type: 'lost',  title: l.itemName,  date: l.dateLost,  image: this.resolveImage(l.imageUrl || l.image, 'lost') }));
        const found = foundArr.map((f: any) => ({ ...f,  type: 'found', title: f.itemName,  date: f.dateFound, image: this.resolveImage(f.imageUrl || f.image, 'found') }));
        this.items = [...lost, ...found].sort((a, b) => (b.id || 0) - (a.id || 0));
        this.uniqueLocations = [...new Set(this.items.map(x => x.location).filter(Boolean))].sort();
        this.loading = false;
        this.applyFilters();
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); }
    });
  }

  setTab(tab: 'all' | 'lost' | 'found') { this.activeTab = tab; this.applyFilters(); }
  search() { this.applyFilters(); }

  applyFilters() {
    const kw  = this.filters.keyword.toLowerCase();
    const cat = this.filters.category.toLowerCase();
    const loc = this.filters.location.toLowerCase();
    this.filteredItems = this.items.filter(item => {
      if (this.activeTab !== 'all' && item.type !== this.activeTab) return false;
      if (kw  && !(item.title    || '').toLowerCase().includes(kw))  return false;
      if (cat && !(item.category || '').toLowerCase().includes(cat)) return false;
      if (loc && !(item.location || '').toLowerCase().includes(loc)) return false;
      return true;
    });
  }

  imgError(event: any) {
    event.target.style.display = 'none';
  }
}
