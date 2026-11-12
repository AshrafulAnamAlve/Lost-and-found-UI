import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_ORIGIN } from './api';
import { session } from './session';

/**
 * Sends the sign-in token with every call to our API, and handles the one answer
 * every page would otherwise have to handle itself: 401, meaning the token is
 * missing or has expired. The user is signed out and sent to the sign-in page,
 * which brings them back to where they were afterwards.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  const token = session.token();
  const ours = req.url.startsWith(API_ORIGIN);
  const request = ours && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      const isSignIn = /\/(login|register)$/i.test(req.url);
      if (ours && err.status === 401 && !isSignIn) {
        const wasSignedIn = !!token;
        session.clear();
        const returnUrl = router.url && !router.url.startsWith('/login') ? router.url : undefined;
        router.navigate(['/login'], { queryParams: returnUrl ? { returnUrl } : {} });
        snackBar.open(
          wasSignedIn ? 'Your session has expired. Please sign in again.' : 'Please sign in to continue.',
          'OK', { duration: 5000, verticalPosition: 'top' });
      }
      return throwError(() => err);
    }),
  );
};

/** The sentence to show for a failed request, preferring what the API said. */
export function apiErrorMessage(err: any, fallback: string): string {
  if (!err) return fallback;
  if (err.status === 0) return 'Cannot reach the server. Check your internet connection and try again.';
  const body = err.error;
  if (typeof body === 'string' && body.trim() && body.length < 200 && !body.trim().startsWith('<')) return body.trim();
  if (body?.message) return body.message;
  if (body?.errors) {
    const first = Object.values(body.errors as Record<string, string[]>)[0];
    if (first?.[0]) return first[0];
  }
  return fallback;
}
