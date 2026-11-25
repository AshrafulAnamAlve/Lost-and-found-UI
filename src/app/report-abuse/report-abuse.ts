import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, HostListener, inject, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MODERATION_API } from '../api';
import { apiErrorMessage } from '../auth.interceptor';

const ITEM_REASONS = [
  'Fake or spam post',
  'Misleading or wrong details',
  'Suspicious / scam attempt',
  'Inappropriate photo or text',
  'Already returned / duplicate post',
  'Other',
];

const USER_REASONS = [
  'Harassment or abusive messages',
  'Suspected scam or impersonation',
  'Posting fake or spam reports',
  'Demanding money or extortion',
  'Inappropriate behavior',
  'Other',
];

@Component({
  selector: 'app-report-abuse',
  imports: [CommonModule, FormsModule],
  templateUrl: './report-abuse.html',
  styleUrl: './report-abuse.css',
})
export class ReportAbuse {
  @Input({ required: true }) targetType!: 'item' | 'user';
  @Input({ required: true }) targetId!: number;
  @Input() itemKind?: 'lost' | 'found' | string;
  @Input() targetLabel = '';

  @Output() close = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<void>();

  private http = inject(HttpClient);
  private snackBar = inject(MatSnackBar);

  selectedReason = '';
  customReason = '';
  details = '';
  submitting = false;
  errorMsg = '';

  get reasons(): string[] {
    return this.targetType === 'user' ? USER_REASONS : ITEM_REASONS;
  }

  get heading(): string {
    return this.targetType === 'user' ? 'Report user' : 'Report this post';
  }

  selectReason(r: string) {
    this.selectedReason = r;
    this.errorMsg = '';
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (!this.submitting) this.close.emit();
  }

  submit() {
    const reason = this.selectedReason === 'Other'
      ? this.customReason.trim()
      : this.selectedReason.trim();

    if (reason.length < 3) {
      this.errorMsg = 'Please choose or enter a reason.';
      return;
    }

    this.submitting = true;
    this.errorMsg = '';

    this.http.post<any>(`${MODERATION_API}/Report`, {
      targetType: this.targetType,
      targetId: this.targetId,
      itemKind: this.targetType === 'item' ? this.itemKind : null,
      reason,
      details: this.details.trim() || null,
    }).subscribe({
      next: (res) => {
        this.submitting = false;
        this.snackBar.open(res?.message || 'Report submitted to administrators.', 'OK', {
          duration: 4500, verticalPosition: 'top', panelClass: 'snack-success',
        });
        this.submitted.emit();
      },
      error: (err) => {
        this.submitting = false;
        this.errorMsg = apiErrorMessage(err, 'Could not submit your report. Please try again.');
      },
    });
  }
}
