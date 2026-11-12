import { Directive, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE as API, resolveImageUrl } from './api';
import { apiErrorMessage } from './auth.interceptor';
import { ITEM_CATEGORIES, categoryLabel, confidenceKey, localToday, toDateInput } from './categories';
import { MatchService } from './match.service';
import { session } from './session';
import { describeError, looksContactable } from './validators';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Everything the "report a lost item" and "report a found item" pages share:
 * contact details from the profile, one photo checked by the image model,
 * creating a report, and editing an existing one (route `lost/edit/:id` or
 * `found/edit/:id`). Each page supplies its own form and wording.
 */
@Directive()
export abstract class ReportForm implements OnInit {
  protected http = inject(HttpClient);
  protected snackBar = inject(MatSnackBar);
  router = inject(Router);
  protected route = inject(ActivatedRoute);
  protected matchSvc = inject(MatchService);

  abstract readonly kind: 'lost' | 'found';
  abstract form: FormGroup;
  protected abstract readonly dateKey: 'dateLost' | 'dateFound';
  protected abstract readonly labels: Record<string, string>;
  /** Found reports need a photo so the owner can recognise the item. */
  protected photoRequired = false;

  readonly categories = ITEM_CATEGORIES;
  categoryLabel = categoryLabel;
  confidenceKey = confidenceKey;

  // ── editing ──────────────────────────────────────────────────────────────
  editId: number | null = null;
  loadingItem = false;
  existingImage = '';
  private originalDetection: { detectedCategory: string | null; detectedConfidence: number | null } =
    { detectedCategory: null, detectedConfidence: null };

  get isEdit(): boolean { return this.editId !== null; }

  // ── photo ────────────────────────────────────────────────────────────────
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  dragging = false;

  get hasPhoto(): boolean { return !!this.selectedFile || !!this.existingImage; }

  // ── submit / results ─────────────────────────────────────────────────────
  isSubmitting = false;
  aiMatches: any[] = [];
  showMatches = false;

  // ── image classifier ─────────────────────────────────────────────────────
  // `detection` is null until a photo has been classified. When the classifier is
  // off or unreachable nothing is shown and the form works exactly as before.
  isClassifying = false;
  detection: {
    label: string | null;
    confidence: number;
    known: boolean;
    category: string | null;
    acceptable: string[];
  } | null = null;
  categoryAutoFilled = false;

  // ── contact details, from the profile ────────────────────────────────────
  profileLoaded = false;
  profileFailed = false;
  contact = { userName: '', email: '', phoneNumber: '', altContact: '' };

  get contactReady(): boolean {
    return !!this.contact.userName && !!this.contact.email && looksContactable(this.contact.phoneNumber);
  }

  ngOnInit(): void {
    this.loadProfile();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId = Number(id);
      this.loadForEdit(this.editId);
    }
  }

  private loadProfile() {
    const id = session.userId();
    if (!id) { this.profileLoaded = true; this.profileFailed = true; return; }

    this.http.get<any>(`${API}/getUser/${id}`).subscribe({
      next: (user) => {
        this.contact = {
          userName:    `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
          email:       user?.email ?? '',
          phoneNumber: user?.phone ?? '',
          altContact:  user?.secondaryPhone ?? '',
        };
        this.form.patchValue(this.contact);
        this.profileLoaded = true;
      },
      error: () => { this.profileLoaded = true; this.profileFailed = true; },
    });
  }

  /** Fills the form from the report being edited. Only its owner may edit it. */
  private loadForEdit(id: number) {
    this.loadingItem = true;
    this.http.get<any>(`${API}/GetItemById/${this.kind}/${id}`).subscribe({
      next: (item) => {
        this.loadingItem = false;
        if (item.userId !== session.userId()) {
          this.notify('You can only edit your own reports.', true);
          this.router.navigate(['/productDetails', this.kind, id]);
          return;
        }
        this.form.patchValue({
          itemName: item.itemName,
          category: (item.category || '').toLowerCase(),
          location: item.location,
          description: item.description,
          [this.dateKey]: toDateInput(item[this.dateKey]),
          timeLost: item.timeLost || '',
          brand: item.brand || '',
          color: item.color || '',
          ...(this.kind === 'lost' ? { Reward: item.reward ?? item.Reward ?? '' } : {}),
          detectedCategory: item.detectedCategory ?? null,
          detectedConfidence: item.detectedConfidence ?? null,
        });
        this.originalDetection = {
          detectedCategory: item.detectedCategory ?? null,
          detectedConfidence: item.detectedConfidence ?? null,
        };
        this.existingImage = resolveImageUrl(item.imageUrl);
      },
      error: (err) => {
        this.loadingItem = false;
        this.notify(apiErrorMessage(err, 'That report could not be loaded.'), true);
        this.router.navigateByUrl('/profile');
      },
    });
  }

  // ── validation messages ──────────────────────────────────────────────────

  err(control: string): string | null {
    return describeError(this.form.get(control), this.labels[control] ?? control);
  }

  private invalidMessage(): string {
    const onlyMissing = Object.keys(this.form.controls).every((key) => {
      const errors = this.form.get(key)?.errors;
      return !errors || Object.keys(errors).every((e) => e === 'required');
    });
    return onlyMissing
      ? 'Please fill in all the required fields.'
      : 'Some fields need correcting. Check the messages in red.';
  }

  protected notify(message: string, isError = false) {
    return this.snackBar.open(message, 'OK', {
      duration: isError ? 6000 : 4000, verticalPosition: 'top',
      panelClass: isError ? 'snack-error' : undefined,
    });
  }

  // ── submit ───────────────────────────────────────────────────────────────

  async submit() {
    if (this.isSubmitting) return;
    if (!this.contactReady) {
      this.notify('Your profile has no phone number yet. Add one on your profile first.', true);
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify(this.invalidMessage(), true);
      setTimeout(() => document.querySelector('.ng-invalid.ng-touched:not(form)')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    if (this.photoRequired && !this.hasPhoto) {
      this.notify('Please add a photo of the item so its owner can recognise it.', true);
      return;
    }

    this.isSubmitting = true;
    try {
      if (this.isEdit) await this.saveEdit();
      else await this.create();
    } catch (err) {
      this.notify(apiErrorMessage(err, 'Could not save the report. Please try again.'), true);
    } finally {
      this.isSubmitting = false;
    }
  }

  private async create() {
    const res: any = await firstValueFrom(this.http.post(`${API}/Post${this.kind === 'lost' ? 'Lost' : 'Found'}`, this.form.value));
    const itemName = this.form.value.itemName;

    const photoProblem = this.selectedFile ? await this.uploadPhoto(res.id) : null;
    const matches: any[] = res.suggestedMatches ?? [];

    if (photoProblem) {
      this.notify(`Report saved, but the photo was not uploaded: ${photoProblem} You can add it later with Edit.`, true);
    }

    if (matches.length > 0) {
      this.aiMatches = matches;
      this.matchSvc.addMatches(res.id, itemName, this.kind, matches);
      this.showMatches = true;
      this.resetForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (!photoProblem) {
        const ref = this.snackBar.open(
          `Report submitted. We found ${matches.length} possible match${matches.length > 1 ? 'es' : ''}.`,
          'View matches', { duration: 7000 });
        ref.onAction().subscribe(() => this.router.navigateByUrl('/matches'));
      }
    } else {
      if (!photoProblem) {
        this.notify('Report submitted. No match yet. Your report stays active and new reports are checked against it automatically.');
      }
      this.resetForm();
      this.router.navigate(['/productDetails', this.kind, res.id]);
    }
  }

  private async saveEdit() {
    const v = this.form.value;
    const body = {
      itemName: v.itemName, category: v.category, location: v.location, description: v.description,
      date: v[this.dateKey], timeLost: v.timeLost, brand: v.brand, color: v.color,
      reward: this.kind === 'lost' ? v.Reward : null,
      detectedCategory: v.detectedCategory, detectedConfidence: v.detectedConfidence,
    };
    const res: any = await firstValueFrom(this.http.put(`${API}/UpdateItem/${this.kind}/${this.editId}`, body));

    const photoProblem = this.selectedFile ? await this.uploadPhoto(this.editId!) : null;
    const matches: any[] = res.suggestedMatches ?? [];
    if (matches.length) this.matchSvc.syncMatches(this.editId!, v.itemName, this.kind, matches);
    else this.matchSvc.removeGroup(this.editId!, this.kind);

    if (photoProblem) this.notify(`Changes saved, but the new photo was not uploaded: ${photoProblem}`, true);
    else this.notify('Changes saved.');
    this.router.navigate(['/productDetails', this.kind, this.editId]);
  }

  /** Uploads the chosen photo. Returns null on success, or the reason it failed. */
  private async uploadPhoto(id: number): Promise<string | null> {
    if (!this.selectedFile) return null;
    const fd = new FormData();
    fd.append('image', this.selectedFile, this.selectedFile.name);
    try {
      await firstValueFrom(this.http.post(`${API}/UploadImage/${this.kind}/${id}`, fd));
      return null;
    } catch (err) {
      return apiErrorMessage(err, 'The upload failed.');
    }
  }

  cancelEdit() {
    this.router.navigate(['/productDetails', this.kind, this.editId]);
  }

  resetForm() {
    this.form.reset({
      type: this.kind,
      [this.dateKey]: localToday(),
      ...(this.kind === 'lost' ? { Reward: '' } : {}),
      brand: '', color: '', timeLost: '',
      ...this.contact,   // reset must not wipe what the profile supplied
    });
    this.selectedFile = null;
    this.previewUrl = null;
    this.isClassifying = false;
    this.clearDetection();
  }

  dismissMatches() { this.showMatches = false; }

  goToMatch(id: number) {
    this.router.navigate(['/productDetails', this.kind === 'lost' ? 'found' : 'lost', id]);
  }

  resolveImg(raw: string | null): string { return resolveImageUrl(raw); }

  // ── photo ────────────────────────────────────────────────────────────────

  onFilePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    this.pickPhoto(input.files?.[0] ?? null);
    input.value = '';   // picking the same file again must still fire a change
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging = false;
    this.pickPhoto(e.dataTransfer?.files?.[0] ?? null);
  }
  onDragOver(e: DragEvent) { e.preventDefault(); this.dragging = true; }
  onDragLeave() { this.dragging = false; }

  private pickPhoto(file: File | null) {
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      this.notify('Please choose a JPG, PNG, WebP or GIF photo.', true);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      this.notify(`That photo is ${(file.size / 1048576).toFixed(1)} MB. Please choose one under 10 MB.`, true);
      return;
    }
    this.selectedFile = file;
    const reader = new FileReader();
    reader.onload = () => { this.previewUrl = reader.result as string; };
    reader.readAsDataURL(file);
    this.classifyImage(file);
  }

  /** Drops the newly chosen photo. When editing, the saved photo and what the model said about it come back. */
  removePhoto() {
    this.selectedFile = null;
    this.previewUrl = null;
    this.isClassifying = false;
    this.detection = null;
    this.categoryAutoFilled = false;
    this.form.patchValue(this.isEdit ? this.originalDetection : { detectedCategory: null, detectedConfidence: null });
  }

  // ── image classification ─────────────────────────────────────────────────

  /** The model is confident, a category is chosen, and the photo does not support it. */
  get categoryMismatch(): boolean {
    const chosen = this.form.value.category;
    const d = this.detection;
    return !!d && d.known && !!d.category && !!chosen && d.acceptable.length > 0 && !d.acceptable.includes(chosen);
  }

  useDetectedCategory() {
    if (!this.detection?.category) return;
    this.form.patchValue({ category: this.detection.category });
    this.categoryAutoFilled = false;
  }

  onCategoryChosen() { this.categoryAutoFilled = false; }

  clearDetection() {
    this.detection = null;
    this.categoryAutoFilled = false;
    this.form.patchValue({ detectedCategory: null, detectedConfidence: null });
  }

  /** Best-effort throughout: a classifier being down must never stop someone reporting an item. */
  private classifyImage(file: File) {
    this.isClassifying = true;
    this.clearDetection();

    const fd = new FormData();
    fd.append('image', file, file.name);

    this.http.post<any>(`${API}/ClassifyImage`, fd).subscribe({
      next: (res) => {
        this.isClassifying = false;
        if (!res?.available) return;

        this.detection = {
          label:      res.label ?? null,
          confidence: res.confidence ?? 0,
          known:      !!res.known,
          category:   res.category ?? null,
          acceptable: res.acceptableCategories ?? [],
        };

        // Only a confident answer is worth recording.
        if (res.known && res.category) {
          this.form.patchValue({ detectedCategory: res.category, detectedConfidence: res.confidence });
          // Suggest, never override: fill the dropdown only while it is still empty.
          if (!this.form.value.category) {
            this.form.patchValue({ category: res.category });
            this.categoryAutoFilled = true;
          }
        }
      },
      error: () => { this.isClassifying = false; this.clearDetection(); },
    });
  }
}
