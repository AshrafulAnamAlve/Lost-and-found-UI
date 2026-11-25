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

/** Pages restricted to administrator accounts. */
export const adminGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const snack = inject(MatSnackBar);

  if (!session.isLoggedIn()) {
    snack.open('Please sign in to continue.', 'OK', { duration: 4000, verticalPosition: 'top' });
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  if (session.isAdmin()) return true;

  snack.open('Administrator access required.', 'OK', { duration: 4000, verticalPosition: 'top', panelClass: 'snack-error' });
  return router.createUrlTree(['/dashbord']);
};
