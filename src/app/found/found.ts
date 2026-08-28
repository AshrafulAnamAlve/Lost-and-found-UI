import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Sidenav } from '../sidenav/sidenav';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { MatchService } from '../match.service';
import { API_ORIGIN } from '../api';

const API = `${API_ORIGIN}/api/LostAndFound`;

@Component({
  selector: 'app-found',
  imports: [Sidenav, CommonModule, ReactiveFormsModule],
  templateUrl: './found.html',
  styleUrl: './found.css',
})
export class Found {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  http     = inject(HttpClient);
  snackBar = inject(MatSnackBar);
  router    = inject(Router);
  matchSvc  = inject(MatchService);

  previews:      string[] = [];
  selectedFiles: File[]   = [];
  isSubmitting          = false;

  // AI match result panel — matched LOST items for the found item
  aiMatches:   any[] = [];
  showMatches       = false;

  // Image classifier state for the photo section. `available: false` means the
  // classifier is off or unreachable, in which case nothing is shown at all.
  isClassifying = false;
  detection: {
    label: string | null;
    confidence: number;
    known: boolean;
    category: string | null;
    available: boolean;
  } | null = null;

  // Set when the category dropdown was filled from the detection, so the banner
  // can say so instead of silently changing a field the user is looking at.
  categoryAutoFilled = false;

  foundforum: FormGroup = new FormGroup({
    itemName:    new FormControl('', Validators.required),
    type:        new FormControl('found'),
    category:    new FormControl('', Validators.required),
    location:    new FormControl('', Validators.required),
    description: new FormControl('', Validators.required),
    dateFound:   new FormControl(new Date().toISOString().split('T')[0], Validators.required),
    timeLost:    new FormControl(''),
    brand:       new FormControl(''),
    color:       new FormControl(''),
    userName:    new FormControl('', Validators.required),
    email:       new FormControl('', [Validators.required, Validators.email]),
    phoneNumber: new FormControl('', Validators.required),
    altContact:  new FormControl(''),
    userid:      new FormControl(parseInt(localStorage.getItem('userid') || '0')),

    // What the image classifier saw, sent with the item so the first match pass
    // can use it — the photo itself only uploads after this post. Kept separate
    // from `category` above: that is the user's answer, this is the model's.
    detectedCategory:   new FormControl<string | null>(null),
    detectedConfidence: new FormControl<number | null>(null),
  });

  foundSubmit() {
    if (this.foundforum.invalid) {
      this.foundforum.markAllAsTouched();
      this.snackBar.open('Please fill all required fields', 'Ok', { duration: 3000, verticalPosition: 'top' });
      return;
    }
    if (this.selectedFiles.length === 0) {
      this.snackBar.open('Please upload at least one photo of the found item', 'Ok', { duration: 3000, verticalPosition: 'top' });
      return;
    }

    this.isSubmitting = true;

    this.http.post<any>(`${API}/PostFound`, this.foundforum.value).subscribe({
      next: (res) => {
        if (!res?.id) {
          this.snackBar.open(res?.message || 'Unexpected response', 'Ok', { duration: 3000 });
          this.isSubmitting = false;
          return;
        }

        // ✅ suggestedMatches = LOST items that match this found item
        const matches: any[] = res.suggestedMatches ?? [];
        if (matches.length > 0) {
          this.aiMatches   = matches;
          this.matchSvc.addMatches(res.id, this.foundforum.value.itemName, 'found', matches);
          this.showMatches = true;
          this.snackBar.open(
            `✅ Reported! Found ${matches.length} possible owner${matches.length > 1 ? 's' : ''} — please contact them!`,
            'View', { duration: 6000 }
          );
        } else {
          this.snackBar.open('Thank you! We will notify users if a match is found.', 'Ok', { duration: 4000 });
        }

        // Always upload the image
        this.uploadImage('found', res.id);
      },
      error: (err) => {
        const msg = err?.error?.message || 'Error reporting found item';
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
    this.foundforum.reset({
      type:     'found',
      dateFound: new Date().toISOString().split('T')[0],
      userid:   parseInt(localStorage.getItem('userid') || '0'),
    });
    this.previews = []; this.selectedFiles = [];
    this.isClassifying = false;
    this.clearDetection();
  }

  dismissMatches() { this.showMatches = false; }

  // Found item matches = LOST items → navigate to lost detail
  goToMatch(id: number) { this.router.navigate(['/productDetails', 'lost', id]); }

  resolveImg(raw: string | null): string {
    if (!raw) return '';
    if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
    return `${API_ORIGIN}${raw}`;
  }

  // ── file helpers ───────────────────────────────────────────────────────────
  onFileSelect(e: any) { this.handleFiles(e.target.files); if (this.fileInput) this.fileInput.nativeElement.value = ''; }
  onDrop(e: DragEvent) { e.preventDefault(); if (e.dataTransfer?.files) this.handleFiles(e.dataTransfer.files); }
  onDragOver(e: DragEvent) { e.preventDefault(); }
  onDragLeave() {}

  handleFiles(files: FileList) {
    this.selectedFiles = Array.from(files).filter(f => f.type.startsWith('image')).slice(0, 6);
    this.previews      = [];
    this.selectedFiles.forEach(f => {
      const r = new FileReader();
      r.onload = () => this.previews.push(r.result as string);
      r.readAsDataURL(f);
    });

    // The first photo is the one uploaded with the item, so it is the one we ask
    // the model about.
    if (this.selectedFiles.length > 0) this.classifyImage(this.selectedFiles[0]);
    else this.clearDetection();
  }

  removeImage(i: number) {
    this.previews.splice(i, 1);
    this.selectedFiles.splice(i, 1);

    // Removing the first photo changes which one gets uploaded, so the previous
    // detection no longer describes it.
    if (i === 0) {
      if (this.selectedFiles.length > 0) this.classifyImage(this.selectedFiles[0]);
      else this.clearDetection();
    }
  }

  // ── image classification ───────────────────────────────────────────────────

  // Human wording for the category values the <select> uses.
  private static readonly CATEGORY_LABELS: Record<string, string> = {
    laptop:     'Laptop / Tablet',
    phone:      'Mobile Phone',
    watch:      'Watch',
    calculator: 'Calculator',
  };

  categoryLabel(value: string | null): string {
    return (value && Found.CATEGORY_LABELS[value]) || value || '';
  }

  clearDetection() {
    this.detection = null;
    this.categoryAutoFilled = false;
    this.foundforum.patchValue({ detectedCategory: null, detectedConfidence: null });
  }

  // Asks the API what the photo shows, then records it on the form.
  //
  // Best-effort throughout: any failure clears the detection and leaves the form
  // untouched, because a classifier being down must never stop someone reporting
  // an item they found.
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
          available:  true,
        };

        // Only a confident answer is worth recording. Below the threshold the
        // model is guessing, and the banner asks the user to pick instead.
        if (res.known && res.category) {
          this.foundforum.patchValue({
            detectedCategory:   res.category,
            detectedConfidence: res.confidence,
          });

          // Suggest, never override: fill the dropdown only while it is still
          // empty, and say so in the banner so the user can correct it.
          if (!this.foundforum.value.category) {
            this.foundforum.patchValue({ category: res.category });
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
