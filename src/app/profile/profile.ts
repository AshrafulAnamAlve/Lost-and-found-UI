import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, inject, OnInit, ViewChild } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Navbar } from '../navbar/navbar';
import { HttpClient } from '@angular/common/http';
import { API_BASE, resolveImageUrl } from '../api';
import { MatchItem, MatchReason, MatchService } from '../match.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserService } from '../user.service';
import { ResolveItem } from '../resolve-item/resolve-item';
import { apiErrorMessage } from '../auth.interceptor';
import { categoryLabel, confidenceKey } from '../categories';
import { session } from '../session';
import {
  PASSWORD_RULES, bdPhone, describeError, matchesField, meaningfulText, optional, personName, placeName,
  strictEmail, strongPassword,
} from '../validators';

interface ProfileMatchGroup {
  itemId: number;
  itemName: string;
  type: 'lost' | 'found';
  matches: MatchItem[];
}

const NO_IMAGE =
  "data:image/svg+xml;charset=UTF-8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><rect width='150' height='150' fill='%23e9edf3'/><text x='50%' y='50%' alignment-baseline='middle' text-anchor='middle' fill='%238a94a6' font-family='sans-serif' font-size='13'>No photo</text></svg>";

@Component({
  selector: 'app-profile',
  imports: [CommonModule, Navbar, RouterModule, ResolveItem, ReactiveFormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit {
  user: any;
  lost: any[] = [];
  found: any[] = [];
  /** The user's reports, newest first, in one shape for the cards. */
  userItems: any[] = [];
  itemsLoaded = false;
  loadFailed = false;

  aiGroups: ProfileMatchGroup[] = [];
  loadingMatches = true;

  categoryLabel = categoryLabel;

  // ── Profile picture ────────────────────────────────────────────────────────
  @ViewChild('avatarInput') avatarInput!: ElementRef<HTMLInputElement>;
  uploadingAvatar = false;
  avatarDragging = false;
  avatarPreview: string | null = null;

  private static readonly MAX_AVATAR_BYTES = 5 * 1024 * 1024;
  private static readonly ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private userSvc = inject(UserService);
  private matchSvc = inject(MatchService);

  // ── Edit profile / change password ─────────────────────────────────────────
  editingProfile = false;
  savingProfile = false;
  profileError = '';
  changingPassword = false;
  savingPassword = false;
  passwordError = '';
  showPasswords = false;

  profileForm = new FormGroup({
    firstName:      new FormControl('', [Validators.required, personName]),
    lastName:       new FormControl('', [Validators.required, personName]),
    email:          new FormControl('', [Validators.required, strictEmail]),
    phone:          new FormControl('', [Validators.required, bdPhone]),
    secondaryPhone: new FormControl('', optional(bdPhone)),
    city:           new FormControl('', [Validators.required, placeName]),
    address:        new FormControl('', [Validators.required, meaningfulText(5, 120)]),
  });

  passwordForm = new FormGroup({
    currentPassword: new FormControl('', Validators.required),
    newPassword:     new FormControl('', [Validators.required, strongPassword]),
    confirmPassword: new FormControl('', [Validators.required, matchesField('newPassword')]),
  });

  private static readonly LABELS: Record<string, string> = {
    firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone number',
    secondaryPhone: 'Secondary phone', city: 'City', address: 'Address',
    currentPassword: 'Current password', newPassword: 'New password', confirmPassword: 'Confirm password',
  };

  constructor() {
    this.passwordForm.get('newPassword')!.valueChanges.subscribe(() =>
      this.passwordForm.get('confirmPassword')!.updateValueAndValidity({ emitEvent: false }));
  }

  pErr(name: string): string | null {
    return describeError(this.profileForm.get(name), Profile.LABELS[name] ?? name);
  }

  pwErr(name: string): string | null {
    const c = this.passwordForm.get(name);
    if (name === 'confirmPassword' && c?.hasError('mismatch') && (c.touched || c.dirty)) return 'Passwords do not match';
    if (name === 'newPassword' && c?.hasError('weakPassword') && (c.touched || c.dirty)) return 'The new password does not meet all the rules below';
    return describeError(c, Profile.LABELS[name] ?? name);
  }

  get newPasswordChecks() {
    const value = this.passwordForm.get('newPassword')?.value || '';
    return PASSWORD_RULES.map((r) => ({ label: r.label, met: r.test(value) }));
  }

  ngOnInit(): void {
    const id = session.userId();
    if (id) {
      this.getUser(id);
      this.getUserItems(id);
    }
  }

  getUser(id: number) {
    this.http.get<any>(`${API_BASE}/getUser/${id}`).subscribe({
      next: (res) => {
        this.user = res;
        session.setName(`${res.firstName || ''} ${res.lastName || ''}`);
        this.cdr.detectChanges();
      },
      error: (err) => this.notify(apiErrorMessage(err, 'Could not load your profile.'), true),
    });
  }

  private normalizeItems(lostArr: any[], foundArr: any[]) {
    const card = (x: any, type: 'lost' | 'found') => ({
      ...x,
      type,
      title: x.itemName || '',
      date: type === 'lost' ? x.dateLost : x.dateFound,
      location: x.location || '',
      image: x.imageUrl ? resolveImageUrl(x.imageUrl) : NO_IMAGE,
    });
    return [...(lostArr || []).map((l) => card(l, 'lost')), ...(foundArr || []).map((f) => card(f, 'found'))]
      .sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
  }

  getUserItems(id: number) {
    this.http.get<any>(`${API_BASE}/GetUserItems/${id}`).subscribe({
      next: (res) => {
        this.lost = res.lost || [];
        this.found = res.found || [];
        this.userItems = this.normalizeItems(this.lost, this.found);
        this.itemsLoaded = true;
        this.loadMatches();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.itemsLoaded = true;
        this.loadFailed = true;
        this.loadingMatches = false;
        this.notify(apiErrorMessage(err, 'Could not load your reports.'), true);
      },
    });
  }

  /** Matches for every open report of the user's, best first. */
  private loadMatches() {
    this.matchSvc.refresh().subscribe({
      next: (groups) => {
        this.aiGroups = groups.map((g) => ({ itemId: g.myItemId, itemName: g.myItemName, type: g.myItemType, matches: g.matches }));
        this.loadingMatches = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loadingMatches = false; this.cdr.detectChanges(); },
    });
  }

  // ── match display helpers ───────────────────────────────────────────────
  matchedKind(type: 'lost' | 'found'): string { return type === 'lost' ? 'found' : 'lost'; }

  confKey(m: MatchItem): 'strong' | 'possible' | 'weak' { return confidenceKey(m); }
  confLabel(m: MatchItem): string {
    return { strong: 'Strong match', possible: 'Possible match', weak: 'Weak match' }[this.confKey(m)];
  }

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

  resolveImg(raw: string | undefined): string { return resolveImageUrl(raw); }

  viewMatch(type: 'lost' | 'found', id: number) {
    this.router.navigate(['/productDetails', this.matchedKind(type), id]);
  }

  // ── edit profile ────────────────────────────────────────────────────────

  openEditProfile() {
    if (!this.user) return;
    this.profileError = '';
    this.profileForm.reset({
      firstName: this.user.firstName || '', lastName: this.user.lastName || '', email: this.user.email || '',
      phone: this.user.phone || '', secondaryPhone: this.user.secondaryPhone || '',
      city: this.user.city || '', address: this.user.address || '',
    });
    this.editingProfile = true;
  }

  saveProfile() {
    this.profileError = '';
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      this.profileError = 'Please correct the fields marked in red.';
      return;
    }
    this.savingProfile = true;
    this.http.put<any>(`${API_BASE}/UpdateUser`, this.profileForm.value).subscribe({
      next: (res) => {
        this.savingProfile = false;
        this.user = { ...this.user, ...res.user };
        session.setName(`${this.user.firstName} ${this.user.lastName}`);
        this.editingProfile = false;
        this.notify('Profile updated. Your reports now show the new contact details.');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.savingProfile = false;
        this.profileError = apiErrorMessage(err, 'Could not save your profile. Please try again.');
      },
    });
  }

  openChangePassword() {
    this.passwordError = '';
    this.passwordForm.reset();
    this.showPasswords = false;
    this.changingPassword = true;
  }

  savePassword() {
    this.passwordError = '';
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.savingPassword = true;
    const { currentPassword, newPassword } = this.passwordForm.value;
    this.http.post<any>(`${API_BASE}/ChangePassword`, { currentPassword, newPassword }).subscribe({
      next: () => {
        this.savingPassword = false;
        this.changingPassword = false;
        this.notify('Password changed.');
      },
      error: (err) => {
        this.savingPassword = false;
        this.passwordError = apiErrorMessage(err, 'Could not change your password. Please try again.');
      },
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() { this.editingProfile = false; this.changingPassword = false; }

  // ── profile picture ─────────────────────────────────────────────────────

  get avatarSrc(): string {
    if (this.avatarPreview) return this.avatarPreview;
    return this.user?.imageUrl ? this.resolveImg(this.user.imageUrl) : '';
  }

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

  private chooseAvatar(file: File) {
    if (!Profile.ALLOWED_TYPES.includes(file.type)) {
      this.notify('Please choose a JPG, PNG, WebP or GIF image.', true);
      return;
    }
    if (file.size > Profile.MAX_AVATAR_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      this.notify(`That image is ${mb} MB. Please choose one under 5 MB.`, true);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => { this.avatarPreview = reader.result as string; this.cdr.detectChanges(); };
    reader.readAsDataURL(file);

    this.uploadAvatar(file);
  }

  private uploadAvatar(file: File) {
    const id = session.userId();
    if (!id) return;

    this.uploadingAvatar = true;
    const fd = new FormData();
    fd.append('image', file, file.name);

    this.http.post<any>(`${API_BASE}/UploadImage/user/${id}`, fd).subscribe({
      next: (res) => {
        if (this.user) this.user.imageUrl = `${res.imageUrl}?t=${Date.now()}`;
        this.userSvc.setAvatar(res.imageUrl);
        this.avatarPreview = null;
        this.uploadingAvatar = false;
        this.notify('Profile picture updated.');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.avatarPreview = null;
        this.uploadingAvatar = false;
        this.notify(apiErrorMessage(err, 'Could not upload the picture. Please try again.'), true);
        this.cdr.detectChanges();
      },
    });
  }

  private notify(message: string, isError = false) {
    this.snackBar.open(message, 'OK', {
      duration: isError ? 6000 : 4000, verticalPosition: 'top', panelClass: isError ? 'snack-error' : undefined,
    });
  }

  // ── closing a report off ────────────────────────────────────────────────

  resolving: any = null;

  isResolved(item: any): boolean { return item?.status === 'resolved'; }

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
    // A closed report is out of matching, so its suggestions go too.
    this.aiGroups = this.aiGroups.filter((g) => !(g.itemId === item.id && g.type === item.type));
    this.matchSvc.removeGroup(item.id, item.type);
    this.cdr.detectChanges();
  }

  reopenItem(item: any) {
    this.http.post<any>(`${API_BASE}/Reopen`, { type: item.type, id: item.id }).subscribe({
      next: () => {
        Object.assign(item, { status: 'open', resolvedAt: null, resolvedWithUserId: null, resolvedWithItemId: null, resolvedNote: null });
        this.notify('Report reopened. It is back in matching.');
        this.loadMatches();
        this.cdr.detectChanges();
      },
      error: (err) => this.notify(apiErrorMessage(err, 'Could not reopen this report.'), true),
    });
  }

  // ── edit / delete ───────────────────────────────────────────────────────

  editItem(item: any) {
    this.router.navigate([`/${item.type}/edit`, item.id]);
  }

  deleteItem(item: any) {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    this.http.delete(`${API_BASE}/Delete/${item.type}/${item.id}`).subscribe({
      next: () => {
        // A lost report and a found report can share the same id, so match on both.
        const same = (x: { id?: number; itemId?: number; type: string }) =>
          (x.id ?? x.itemId) === item.id && x.type === item.type;
        this.userItems = this.userItems.filter((i) => !same(i));
        this.aiGroups = this.aiGroups.filter((g) => !same(g));
        this.matchSvc.removeGroup(item.id, item.type);
        this.notify('Report deleted.');
        this.cdr.detectChanges();
      },
      error: (err) => this.notify(apiErrorMessage(err, 'Could not delete this report.'), true),
    });
  }

  imgError(event: any) {
    (event.target as HTMLImageElement).src = NO_IMAGE;
  }
}
