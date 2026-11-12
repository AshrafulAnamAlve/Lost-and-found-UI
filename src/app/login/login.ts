import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, HostListener, inject, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  PASSWORD_RULES, bdPhone, describeError, matchesField, meaningfulText, optional, personName, placeName,
  strictEmail, strongPassword,
} from '../validators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { API_BASE, resolveImageUrl } from '../api';
import { PHOTO_CATEGORIES, itemMatchesCategory } from '../categories';
import { session } from '../session';
import { apiErrorMessage } from '../auth.interceptor';

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
  route = inject(ActivatedRoute);
  snackBar = inject(MatSnackBar);

  /** Already signed in: the landing page offers the dashboard instead of sign-in. */
  get signedIn(): boolean { return session.isLoggedIn(); }

  // ── Landing page facts ─────────────────────────────────────────────────────
  //
  // The counts are read from the live database on load, and the accuracy figure
  // comes from the classifier that ships with the API.

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

  // ── Form state ─────────────────────────────────────────────────────────────
  showLoginPassword = false;
  showSignupPassword = false;
  loggingIn = false;
  registering = false;
  loginError = '';
  signupError = '';

  RegisterForm: FormGroup = new FormGroup({
    firstName:       new FormControl('', [Validators.required, personName]),
    lastName:        new FormControl('', [Validators.required, personName]),
    email:           new FormControl('', [Validators.required, strictEmail]),
    password:        new FormControl('', [Validators.required, strongPassword]),
    confirmPassword: new FormControl('', [Validators.required, matchesField('password')]),
    phone:           new FormControl('', [Validators.required, bdPhone]),
    address:         new FormControl('', [Validators.required, meaningfulText(5, 120)]),
    city:            new FormControl('', [Validators.required, placeName]),
    secondaryPhone:  new FormControl('', optional(bdPhone)),
  });

  // Login stays deliberately loose: these rules describe how an account is
  // created, and an existing account must never be locked out by a rule added
  // after it was made.
  loginForm: FormGroup = new FormGroup({
    email:    new FormControl('', [Validators.required, strictEmail]),
    password: new FormControl('', Validators.required),
  });

  constructor() {
    // Re-check "confirm password" whenever the password itself changes.
    this.RegisterForm.get('password')!.valueChanges.subscribe(() =>
      this.RegisterForm.get('confirmPassword')!.updateValueAndValidity({ emitEvent: false }));
  }

  /** The message for whatever rule a sign-up field is currently failing, or null. */
  err(control: string): string | null {
    const c = this.RegisterForm.get(control);
    if (control === 'confirmPassword' && c?.hasError('mismatch') && (c.touched || c.dirty)) {
      return 'Passwords do not match';
    }
    if (control === 'password') return null;   // the checklist below the box says it
    return describeError(c, Login.LABELS[control] ?? control);
  }

  /** Same, for the sign-in form. */
  loginErr(control: 'email' | 'password'): string | null {
    return describeError(this.loginForm.get(control), control === 'email' ? 'Email' : 'Password');
  }

  private static readonly LABELS: Record<string, string> = {
    firstName:       'First name',
    lastName:        'Last name',
    email:           'Email',
    password:        'Password',
    confirmPassword: 'Confirm password',
    phone:           'Phone number',
    address:         'Address',
    city:            'City',
    secondaryPhone:  'Secondary phone',
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

  get passwordTouched(): boolean {
    const c = this.RegisterForm.get('password');
    return !!c && (c.touched || c.dirty) && c.invalid;
  }

  ngOnInit(): void {
    this.loadStats();

    // Sent here by a protected page: sign in, then go back there.
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl && returnUrl.startsWith('/') && !this.signedIn) {
      this.pendingRedirect = returnUrl;
      this.openLogin();
    }
  }

  /**
   * Reads the real item counts off the API. Best-effort: if the backend is not
   * reachable the live tiles simply do not render.
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
   * Anyone can look; the finder's name and number stay behind sign-in.
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
    if (this.signedIn) {
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
    this.signupError = '';
    if (this.RegisterForm.invalid) {
      this.RegisterForm.markAllAsTouched();
      const pw = this.RegisterForm.get('password');
      this.signupError = pw?.hasError('weakPassword')
        ? 'Your password does not meet all the requirements yet.'
        : this.RegisterForm.get('confirmPassword')?.hasError('mismatch')
          ? 'The two passwords do not match.'
          : 'Please correct the fields marked in red.';
      return;
    }

    this.registering = true;
    const { confirmPassword, ...body } = this.RegisterForm.value;
    this.http.post(`${API_BASE}/Register`, body, { responseType: 'text' }).subscribe({
      next: () => {
        this.registering = false;
        const email = this.RegisterForm.value.email;
        this.RegisterForm.reset();
        this.openLogin();
        this.loginForm.patchValue({ email });
        this.snackBar.open('Account created. Sign in with your new password.', 'OK',
          { duration: 5000, verticalPosition: 'top', panelClass: 'snack-success' });
      },
      error: (err) => {
        this.registering = false;
        this.signupError = apiErrorMessage(err, 'Could not create your account. Please try again.');
      },
    });
  }

  onLogin() {
    this.loginError = '';
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loggingIn = true;
    const body = { email: this.loginForm.value.email.trim(), password: this.loginForm.value.password };
    this.http.post<any>(`${API_BASE}/login`, body).subscribe({
      next: (res) => {
        this.loggingIn = false;
        if (!res?.token) {
          this.loginError = 'Sign-in failed. Please try again.';
          return;
        }
        session.start(res);
        this.showLogin = false;
        this.snackBar.open(`Welcome back${res.firstName ? ', ' + res.firstName : ''}.`, 'OK', { duration: 3000 });
        this.router.navigateByUrl(this.pendingRedirect ?? '/dashbord');
        this.pendingRedirect = null;
      },
      error: (err) => {
        this.loggingIn = false;
        this.loginError = err?.status === 401
          ? 'The email or password is incorrect.'
          : apiErrorMessage(err, 'Could not sign you in. Please try again.');
      },
    });
  }

  openLogin()  { this.showLogin = true;  this.showSignup = false; this.loginError = ''; }
  openSignup() { this.showSignup = true; this.showLogin = false; this.signupError = ''; }
  closeModal() { this.showLogin = false; this.showSignup = false; }

  @HostListener('document:keydown.escape')
  onEscape() { if (this.showLogin || this.showSignup) this.closeModal(); }
}
