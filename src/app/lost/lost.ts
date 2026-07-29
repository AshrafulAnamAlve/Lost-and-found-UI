import { Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Sidenav } from '../sidenav/sidenav';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { MatchService } from '../match.service';

const API = 'https://localhost:7124/api/LostAndFound';

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
    if (this.previewEl) this.previewEl.nativeElement.innerHTML = '';
  }

  dismissMatches() { this.showMatches = false; }

  goToMatch(id: number) { this.router.navigate(['/productDetails', 'found', id]); }

  resolveImg(raw: string | null): string {
    if (!raw) return '';
    if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
    return `https://localhost:7124${raw}`;
  }

  // ── file upload helpers ────────────────────────────────────────────────────
  onUploadClick()                   { this.fileInput.nativeElement.click(); }
  onFilesSelected(e: any)           { this.handleFiles(e.target.files); }
  onDrop(e: DragEvent)              { e.preventDefault(); if (e.dataTransfer) this.handleFiles(e.dataTransfer.files); (e.currentTarget as HTMLElement).classList.remove('dragover'); }
  onDragOver(e: DragEvent)          { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('dragover'); }
  onDragLeave(e: DragEvent)         { (e.currentTarget as HTMLElement).classList.remove('dragover'); }

  handleFiles(files: FileList) {
    this.selectedFiles = Array.from(files).filter(f => f.type.startsWith('image')).slice(0, 6);
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
}
