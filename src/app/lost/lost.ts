import { Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Sidenav } from '../sidenav/sidenav';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { MatchService } from '../match.service';
import { API_BASE as API, resolveImageUrl } from '../api';

@Component({
  selector: 'app-lost',
  imports: [Sidenav, ReactiveFormsModule, CommonModule],
  templateUrl: './lost.html',
  styleUrl: './lost.css',
})
export class Lost implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('preview')   previewEl!: ElementRef<HTMLDivElement>;

  http     = inject(HttpClient);
  snackBar = inject(MatSnackBar);
  router    = inject(Router);
  matchSvc  = inject(MatchService);

  selectedFiles: File[] = [];
  isSubmitting = false;

  // AI match result panel
  aiMatches:   any[] = [];
  showMatches       = false;

  // Image classifier state for the photo section.
  // `detection` is null until a photo has been classified; `available: false`
  // means the classifier is switched off or unreachable, in which case the UI
  // shows nothing at all and the form behaves exactly as it did before.
  isClassifying = false;
  detection: {
    label: string | null;
    confidence: number;
    known: boolean;
    category: string | null;
    // Categories the photo does not contradict, straight from the API - the
    // rule lives in ItemClassificationService so there is only one copy of it.
    acceptable: string[];
    available: boolean;
  } | null = null;

  // Set when we filled the category dropdown from the detection, so the banner
  // can say so rather than silently changing a field the user is looking at.
  categoryAutoFilled = false;

  lostForm: FormGroup = new FormGroup({
    itemName:    new FormControl('', Validators.required),
    type:        new FormControl('lost'),
    category:    new FormControl('', Validators.required),
    location:    new FormControl('', Validators.required),
    description: new FormControl('', Validators.required),
    dateLost:    new FormControl(new Date().toISOString().split('T')[0], Validators.required),
    timeLost:    new FormControl(''),
    brand:       new FormControl(''),
    color:       new FormControl('', Validators.required),
    Reward:      new FormControl(''),
    userName:    new FormControl('', Validators.required),
    email:       new FormControl('', [Validators.required, Validators.email]),
    phoneNumber: new FormControl('', Validators.required),
    altContact:  new FormControl(''),
    userid:      new FormControl(parseInt(localStorage.getItem('userid') || '0')),

    // What the image classifier saw, sent with the item so the very first match
    // pass can use it. The photo itself is uploaded after this post, so waiting
    // for UploadImage to classify would be too late for these matches.
    // Separate from `category` above: that is the user's answer, this is the
    // model's, and the matching engine weighs them very differently.
    detectedCategory:   new FormControl<string | null>(null),
    detectedConfidence: new FormControl<number | null>(null),
  });

  ngOnInit(): void {}

  lostSubmit() {
    if (this.lostForm.invalid) {
      this.lostForm.markAllAsTouched();
      this.snackBar.open('Please fill all required fields', 'Ok', { duration: 3000, verticalPosition: 'top' });
      return;
    }

    this.isSubmitting = true;

    this.http.post<any>(`${API}/PostLost`, this.lostForm.value).subscribe({
      next: (res) => {
        if (!res?.id) {
          this.snackBar.open(res?.message || 'Unexpected response', 'Ok', { duration: 3000 });
          this.isSubmitting = false;
          return;
        }

        // ✅ Show AI matches immediately from response
        const matches: any[] = res.suggestedMatches ?? [];
        if (matches.length > 0) {
          this.aiMatches   = matches;
          this.matchSvc.addMatches(res.id, this.lostForm.value.itemName, 'lost', matches);
          this.showMatches = true;
          this.snackBar.open(
            `✅ Reported! AI found ${matches.length} possible match${matches.length > 1 ? 'es' : ''}!`,
            'View Matches', { duration: 6000 }
          );
        } else {
          this.snackBar.open("Lost item reported! We'll notify you when a match is found.", 'Ok', { duration: 4000 });
        }

        // Upload image then navigate
        if (this.selectedFiles.length > 0) {
          this.uploadImage('lost', res.id);
        } else {
          this.isSubmitting = false;
          this.resetForm();
          // Navigate after 3s so user can see matches
          if (matches.length === 0) setTimeout(() => this.router.navigate(['/reports']), 2000);
        }
      },
      error: (err) => {
        const msg = err?.error?.message || err?.statusText || 'Error reporting lost item';
        this.snackBar.open(msg, 'Ok', { duration: 4000, verticalPosition: 'top' });
        this.isSubmitting = false;
      },
    });
  }

  uploadImage(type: string, id: number) {
    const fd = new FormData();
    fd.append('image', this.selectedFiles[0], this.selectedFiles[0].name);
    this.http.post<any>(`${API}/UploadImage/${type}/${id}`, fd).subscribe({
      next:  () => { this.isSubmitting = false; this.resetForm(); },
      error: () => { this.isSubmitting = false; this.resetForm(); },
    });
  }

  resetForm() {
    this.lostForm.reset({
      type:     'lost',
      dateLost: new Date().toISOString().split('T')[0],
      userid:   parseInt(localStorage.getItem('userid') || '0'),
    });
    this.selectedFiles = [];
    this.isClassifying = false;
    this.clearDetection();
    if (this.previewEl) this.previewEl.nativeElement.innerHTML = '';
  }

  dismissMatches() { this.showMatches = false; }

  goToMatch(id: number) { this.router.navigate(['/productDetails', 'found', id]); }

  resolveImg(raw: string | null): string {
    return resolveImageUrl(raw);
  }

  // ── file upload helpers ────────────────────────────────────────────────────
  onUploadClick()                   { this.fileInput.nativeElement.click(); }
  onFilesSelected(e: any)           { this.handleFiles(e.target.files); }
  onDrop(e: DragEvent)              { e.preventDefault(); if (e.dataTransfer) this.handleFiles(e.dataTransfer.files); (e.currentTarget as HTMLElement).classList.remove('dragover'); }
  onDragOver(e: DragEvent)          { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('dragover'); }
  onDragLeave(e: DragEvent)         { (e.currentTarget as HTMLElement).classList.remove('dragover'); }

  handleFiles(files: FileList) {
    this.selectedFiles = Array.from(files).filter(f => f.type.startsWith('image')).slice(0, 6);

    // The first photo is the one uploaded with the item, so it is the one we ask
    // the model about.
    if (this.selectedFiles.length > 0) this.classifyImage(this.selectedFiles[0]);
    else this.clearDetection();

    const container    = this.previewEl?.nativeElement;
    if (!container) return;
    container.innerHTML = '';
    this.selectedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const wrap = document.createElement('div');     wrap.className = 'preview-item';
        const img  = document.createElement('img');     img.src = e.target.result;
        const rm   = document.createElement('div');     rm.className = 'remove-img'; rm.innerHTML = '&times;';
        rm.onclick = () => { wrap.remove(); this.selectedFiles = this.selectedFiles.filter(f => f !== file); };
        wrap.appendChild(img); wrap.appendChild(rm); container.appendChild(wrap);
      };
      reader.readAsDataURL(file);
    });
  }

  // ── image classification ───────────────────────────────────────────────────

  // Human wording for the category values the <select> above uses.
  private static readonly CATEGORY_LABELS: Record<string, string> = {
    wallet:      'Wallet / Purse',
    phone:       'Mobile Phone',
    laptop:      'Laptop / Tablet',
    calculator:  'Calculator',
    keys:        'Keys',
    bag:         'Bag / Backpack',
    documents:   'Documents / ID / Passport',
    watch:       'Watch',
    jewelry:     'Jewelry',
    electronics: 'Other Electronics',
    clothing:    'Clothing / Shoes',
    other:       'Other',
  };

  categoryLabel(value: string | null): string {
    return (value && Lost.CATEGORY_LABELS[value]) || value || '';
  }

  // True when the model is confident, the user has chosen a category, and the photo
  // does not support that choice.
  //
  // This is the one thing here the user cannot do for themselves. Filling an empty
  // dropdown only saves a tap they were about to make anyway; catching a photo filed
  // under the wrong category is a mistake they cannot see, and a mis-filed item is
  // one the matching engine will struggle to find later.
  //
  // Always a warning, never a correction: the user is holding the object and the
  // model is not, so they are allowed to be right and it is allowed to be wrong.
  get categoryMismatch(): boolean {
    const chosen = this.lostForm.value.category;
    const d = this.detection;

    return !!d && d.known && !!d.category && !!chosen
        && d.acceptable.length > 0
        && !d.acceptable.includes(chosen);
  }

  // Accepts the model's reading. Patching the control does not raise the DOM change
  // event, so this does not look like the user picking a category by hand.
  useDetectedCategory() {
    if (!this.detection?.category) return;
    this.lostForm.patchValue({ category: this.detection.category });
    this.categoryAutoFilled = false;
  }

  // Once the user has picked a category themselves, the banner must stop saying the
  // form filled it in for them.
  onCategoryChosen() {
    this.categoryAutoFilled = false;
  }

  clearDetection() {
    this.detection = null;
    this.categoryAutoFilled = false;
    this.lostForm.patchValue({ detectedCategory: null, detectedConfidence: null });
  }

  // Asks the API what the photo shows, then records it on the form.
  //
  // Best-effort throughout: any failure clears the detection and leaves the form
  // untouched, because a classifier being down must never stop someone reporting
  // a lost item.
  classifyImage(file: File) {
    this.isClassifying = true;
    this.clearDetection();

    const fd = new FormData();
    fd.append('image', file, file.name);

    this.http.post<any>(`${API}/ClassifyImage`, fd).subscribe({
      next: (res) => {
        this.isClassifying = false;

        if (!res?.available) return;   // classifier off or unreachable — stay silent

        this.detection = {
          label:      res.label ?? null,
          confidence: res.confidence ?? 0,
          known:      !!res.known,
          category:   res.category ?? null,
          acceptable: res.acceptableCategories ?? [],
          available:  true,
        };

        // Only a confident answer is worth recording. Below the threshold the
        // model is guessing, and the banner asks the user to pick instead.
        if (res.known && res.category) {
          this.lostForm.patchValue({
            detectedCategory:   res.category,
            detectedConfidence: res.confidence,
          });

          // Suggest, never override: fill the dropdown only while it is still
          // empty, and say so in the banner so the user can correct it.
          if (!this.lostForm.value.category) {
            this.lostForm.patchValue({ category: res.category });
            this.categoryAutoFilled = true;
          }
        }
      },
      error: () => {
        // Same as unavailable — the photo still uploads, just without a category.
        this.isClassifying = false;
        this.clearDetection();
      },
    });
  }
}
