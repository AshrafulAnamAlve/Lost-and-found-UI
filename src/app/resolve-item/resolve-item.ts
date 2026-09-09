import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { API_BASE, resolveImageUrl } from '../api';

/**
 * Closing a report off — "I got it back" / "I handed it over".
 *
 * Naming the other person is optional by design. The matching engine is right
 * most of the time, not all of the time, and plenty of things come back through
 * a friend or the front desk. Somebody in that position still has to be able to
 * close their report, so "Someone not on this list" is a first-class answer
 * rather than a fallback buried behind an error.
 */
@Component({
  selector: 'app-resolve-item',
  imports: [CommonModule, FormsModule],
  templateUrl: './resolve-item.html',
  styleUrl: './resolve-item.css',
})
export class ResolveItem {
  /** The report being closed. Needs at least { id, type, itemName }. */
  @Input({ required: true }) item!: any;

  /** The AI's suggestions for this item, offered as the people it might have gone to. */
  @Input() matches: any[] = [];

  /** Emits the API's resolution payload once the report is closed. */
  @Output() resolved = new EventEmitter<any>();
  @Output() cancelled = new EventEmitter<void>();

  private http = inject(HttpClient);
  private snackBar = inject(MatSnackBar);

  /** The chosen counterpart's item id, or null for "someone not on this list". */
  choice: number | null = null;
  note = '';
  saving = false;

  get isLost(): boolean { return (this.item?.type || '').toLowerCase() === 'lost'; }

  get heading(): string {
    return this.isLost ? 'Mark as returned' : 'Mark as handed over';
  }

  get question(): string {
    return this.isLost
      ? 'Who returned it to you?'
      : 'Who did you hand it to?';
  }

  get confirmLabel(): string {
    return this.isLost ? 'Yes, I got it back' : 'Yes, I handed it over';
  }

  matchImage(match: any): string { return resolveImageUrl(match?.imageUrl); }

  confirm() {
    if (this.saving) return;
    this.saving = true;

    const chosen = this.choice ? this.matches.find((m) => m.id === this.choice) : null;

    this.http.post<any>(`${API_BASE}/MarkResolved`, {
      type: this.item.type,
      id: this.item.id,
      userId: Number(localStorage.getItem('userid') || 0),
      counterpartItemId: chosen ? chosen.id : null,
      counterpartUserId: chosen ? chosen.userId ?? null : null,
      note: this.note.trim() || null,
    }).subscribe({
      next: (res) => {
        this.saving = false;
        this.snackBar.open(
          this.isLost ? 'Marked as returned 🎉' : 'Marked as handed over 🎉',
          'Ok', { duration: 4000, verticalPosition: 'top' });
        this.resolved.emit(res);
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open(
          err?.error?.message || 'Could not update this report. Please try again.',
          'Ok', { duration: 4000, verticalPosition: 'top' });
      },
    });
  }
}
