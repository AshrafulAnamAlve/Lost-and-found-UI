import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanActivateFn, Router } from '@angular/router';
import { session } from './session';

/** Pages behind sign-in. Remembers where the visitor was going, so sign-in can take them there. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (session.isLoggedIn()) return true;

  inject(MatSnackBar).open('Please sign in to continue.', 'OK', { duration: 4000, verticalPosition: 'top' });
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
