import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API_BASE, resolveImageUrl } from './api';

const AVATAR_KEY = 'laf_avatar_url';

/**
 * The signed-in user's picture, shared by everything that shows it.
 *
 * The profile page writes it the moment an upload succeeds and the navbar reads
 * it, so a new photo appears everywhere at once instead of only after a reload.
 * The raw path is cached in localStorage so the avatar is on screen from the
 * first paint rather than after a round trip.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);

  /** Absolute URL of the avatar, or '' when the user has not uploaded one. */
  readonly avatarUrl = signal<string>('');

  constructor() {
    const cached = localStorage.getItem(AVATAR_KEY);
    if (cached) this.avatarUrl.set(resolveImageUrl(cached));
  }

  /** Fetches the avatar once per session, only when nothing is cached yet. */
  loadOnce() {
    const id = localStorage.getItem('userid');
    if (!id || this.avatarUrl()) return;

    this.http.get<any>(`${API_BASE}/getUser/${id}`).subscribe({
      next: (user) => { if (user?.imageUrl) this.setAvatar(user.imageUrl); },
      error: () => {},   // an avatar is decoration; never surface a failure for it
    });
  }

  /** Records a freshly uploaded picture. `raw` is the stored path, e.g. "/uploads/user/x.jpg". */
  setAvatar(raw: string) {
    const path = raw.split('?')[0];
    localStorage.setItem(AVATAR_KEY, path);
    // Cache-buster: the path can repeat, and browsers hold on to the old bytes.
    this.avatarUrl.set(`${resolveImageUrl(path)}?t=${Date.now()}`);
  }

  clear() {
    localStorage.removeItem(AVATAR_KEY);
    this.avatarUrl.set('');
  }
}
