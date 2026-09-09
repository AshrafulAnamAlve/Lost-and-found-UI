import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, inject, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import {
  bdPhone, describeError, meaningfulText, optional, personName, placeName, strictEmail,
} from '../validators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { API_BASE, resolveImageUrl } from '../api';
import { PHOTO_CATEGORIES, itemMatchesCategory } from '../categories';

/** The rules a sign-up password has to satisfy. Each one lights up green as it is met. */
export const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: 'At least 8 characters',        test: (v) => v.length >= 8 },
  { label: 'One uppercase letter (A-Z)',   test: (v) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter (a-z)',   test: (v) => /[a-z]/.test(v) },
  { label: 'One number (0-9)',             test: (v) => /[0-9]/.test(v) },
  { label: 'One symbol (!@#$...)',         test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** Blocks registration until every rule above passes. Login is deliberately left alone. */
export function strongPassword(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value || '';
  if (!value) return { required: true };
  return PASSWORD_RULES.every((r) => r.test(value)) ? null : { weakPassword: true };
}

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements AfterViewInit, OnInit {
  showLogin = false;
  showSignup = false;
  http = inject(HttpClient);
  router = inject(Router);
  snackBar = inject(MatSnackBar);

  // ── Landing page facts ─────────────────────────────────────────────────────
  //
  // Everything shown on this page has to be something we can point at: the counts
  // are read from the live database on load, and the two model numbers come from
  // the classifier that actually ships with the API. Nothing here is decorative.

  /** Test-set accuracy of the trained image classifier (MLModels/model.onnx). */
  readonly photoAccuracy = 88.03;

  /** The four categories the photo model recognises. */
  readonly categories = PHOTO_CATEGORIES;

  statsLoaded = false;
  totalItems = 0;
  foundWaiting = 0;
  locationsCovered = 0;
  categoryCounts: Record<string, number> = {};

  /** Every report, kept so the preview below can be opened without another request. */
  private items: any[] = [];

  /** The category currently being previewed on this page, if any. */
  previewCategory: string | null = null;

  /** How many preview cards to render before the "and N more" line. */
  private static readonly PREVIEW_LIMIT = 8;

  /** Where to go once signed in, when the visitor clicked something specific first. */
  private pendingRedirect: string | null = null;

  RegisterForm: FormGroup = new FormGroup({
    firstName:     new FormControl('', [Validators.required, personName]),
    lastName:      new FormControl('', [Validators.required, personName]),
    email:         new FormControl('', [Validators.required, strictEmail]),
    password:      new FormControl('', [Validators.required, strongPassword]),
    phone:         new FormControl('', [Validators.required, bdPhone]),
    address:       new FormControl('', [Validators.required, meaningfulText(5, 120)]),
    city:          new FormControl('', [Validators.required, placeName]),
    secondaryPhone: new FormControl('', optional(bdPhone)),
  });

  // Login stays deliberately loose: these rules describe how an account is
  // created, and an existing account must never be locked out by a rule added
  // after it was made.
  loginForm: FormGroup = new FormGroup({
    email:    new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', Validators.required),
  });

  /** The message for whatever rule a sign-up field is currently failing, or null. */
  err(control: string): string | null {
    return describeError(this.RegisterForm.get(control), Login.LABELS[control] ?? control);
  }

  private static readonly LABELS: Record<string, string> = {
    firstName:      'First name',
    lastName:       'Last name',
    email:          'Email',
    password:       'Password',
    phone:          'Phone number',
    address:        'Address',
    city:           'City',
    secondaryPhone: 'Secondary phone',
  };

  /** Live checklist for the sign-up password box — recomputed on every keystroke. */
  get passwordChecks(): { label: string; met: boolean }[] {
    const value: string = this.RegisterForm.get('password')?.value || '';
    return PASSWORD_RULES.map((r) => ({ label: r.label, met: r.test(value) }));
  }

  get passwordScore(): number {
    return this.passwordChecks.filter((c) => c.met).length;
  }

  get passwordStrength(): { level: string; label: string } {
    const score = this.passwordScore;
    if (!this.RegisterForm.get('password')?.value) return { level: 'empty', label: '' };
    if (score <= 2) return { level: 'weak',   label: 'Weak' };
    if (score <= 4) return { level: 'medium', label: 'Medium' };
    return { level: 'strong', label: 'Strong' };
  }

  ngOnInit(): void {
    this.loadStats();
  }

  /**
   * Reads the real item counts off the API. Best-effort: if the backend is not
   * reachable the two live tiles simply do not render, rather than the page
   * showing a number nobody can verify.
   */
  private loadStats() {
    this.http.get<any>(`${API_BASE}/GetAllItem`).subscribe({
      next: (res) => {
        const lost:  any[] = (res?.lost  ?? res?.Lost  ?? []).map((i: any) => ({ ...i, type: 'lost',  date: i.dateLost }));
        const found: any[] = (res?.found ?? res?.Found ?? []).map((i: any) => ({ ...i, type: 'found', date: i.dateFound }));
        this.items = [...lost, ...found].sort((a, b) => (b.id || 0) - (a.id || 0));

        this.totalItems   = lost.length + found.length;
        this.foundWaiting = found.length;

        // Distinct places people have actually named on a report. Normalised so
        // "BUBT Cafeteria" and "bubt cafeteria " are not counted as two.
        const places = new Set(
          [...lost, ...found]
            .map((item) => (item?.location || '').trim().toLowerCase())
            .filter(Boolean),
        );
        this.locationsCovered = places.size;

        // Counted with the same rule the browse page filters by, so a card
        // saying 6 always opens a list of 6.
        const counts: Record<string, number> = {};
        for (const category of this.categories) {
          counts[category.key] = this.items.filter((item) => itemMatchesCategory(item, category.key)).length;
        }
        this.categoryCounts = counts;
        this.statsLoaded = true;
      },
      error: () => { this.statsLoaded = false; },
    });
  }

  /**
   * Opens a read-only preview of one category, right here on the landing page.
   *
   * Signing in is not required to look: someone who just lost their phone should
   * be able to see whether it has been handed in before deciding to make an
   * account. What stays behind the login is everything personal — the finder's
   * name and number — which is why the preview shows the item and nothing else.
   */
  openCategory(key: string) {
    this.previewCategory = this.previewCategory === key ? null : key;
    if (this.previewCategory) {
      setTimeout(() => {
        document.getElementById('category-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }

  closePreview() { this.previewCategory = null; }

  /** Items in the open category, newest first. */
  get previewItems(): any[] {
    if (!this.previewCategory) return [];
    return this.items.filter((item) => itemMatchesCategory(item, this.previewCategory!));
  }

  get previewShown(): any[] { return this.previewItems.slice(0, Login.PREVIEW_LIMIT); }
  get previewHidden(): number { return Math.max(0, this.previewItems.length - Login.PREVIEW_LIMIT); }

  get previewLabel(): string {
    return this.categories.find((c) => c.key === this.previewCategory)?.label ?? '';
  }

  /** The full report — including how to contact the person — needs an account. */
  openItem(item: any) {
    this.goTo(`/productDetails/${item.type}/${item.id}`);
  }

  itemImage(item: any): string {
    return resolveImageUrl(item?.imageUrl || item?.image);
  }

  /** Sends a signed-in visitor straight there; everyone else signs in and lands there after. */
  goTo(url: string) {
    if (localStorage.getItem('isLoggedin')) {
      this.router.navigateByUrl(url);
      return;
    }
    this.pendingRedirect = url;
    this.openLogin();
  }

  ngAfterViewInit(): void {
    this.createParticles();
  }

  private createParticles(): void {
    const container = document.getElementById('particles');
    if (!container) return;
    const colors = ['rgba(233,69,96,.3)', 'rgba(26,188,156,.3)', 'rgba(52,152,219,.3)', 'rgba(243,156,18,.3)'];
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const s = Math.random() * 12 + 4;
      p.style.cssText = `width:${s}px;height:${s}px;left:${Math.random() * 100}%;top:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation-delay:${Math.random() * 6}s;animation-duration:${4 + Math.random() * 6}s`;
      container.appendChild(p);
    }
  }

  onRegister() {
    if (this.RegisterForm.invalid) {
      this.RegisterForm.markAllAsTouched();
      const message = this.RegisterForm.get('password')?.hasError('weakPassword')
        ? 'Your password does not meet all the requirements yet'
        : 'Please fill all required fields';
      this.snackBar.open(message, 'Ok', { duration: 3000, verticalPosition: 'top' });
      return;
    }
    this.http.post(`${API_BASE}/Register`, this.RegisterForm.value, { responseType: 'text' }).subscribe({
      next: (res: string) => {
        if (res === 'Registration successful') {
          this.snackBar.open('Account created! Please sign in.', 'Ok', { duration: 4000, verticalPosition: 'top' });
          this.RegisterForm.reset();
          this.openLogin();
        }
      },
      error: () => {
        this.snackBar.open('Something went wrong', 'Ok', { duration: 3000, verticalPosition: 'top' });
      },
    });
  }

  onLogin() {
    if (this.loginForm.invalid) {
      this.snackBar.open('Please enter valid credentials', 'Ok', { duration: 3000, verticalPosition: 'top' });
      return;
    }
    this.http.post(`${API_BASE}/login`, this.loginForm.value).subscribe({
      next: (res: any) => {
        if (res.message === 'Login Successfull') {
          localStorage.setItem('isLoggedin', 'token');
          localStorage.setItem('userid', res.userid);
          if (res.firstName || res.lastName) {
            localStorage.setItem('username', `${res.firstName || ''} ${res.lastName || ''}`.trim());
          }
          this.snackBar.open('Welcome back! 👋', 'Ok', { duration: 3000 });
          this.router.navigateByUrl(this.pendingRedirect ?? '/dashbord');
          this.pendingRedirect = null;
        }
      },
      error: () => {
        this.snackBar.open('Incorrect email or password', 'Ok', { duration: 3000, verticalPosition: 'top' });
      },
    });
  }

  openLogin()  { this.showLogin = true;  this.showSignup = false; }
  openSignup() { this.showSignup = true; this.showLogin = false; }
  closeModal() { this.showLogin = false; this.showSignup = false; }
}
