import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const snackBar = inject(MatSnackBar)
  const token = localStorage.getItem("isLoggedin");
  if(!token){
    snackBar.open("Please Login", "Ok");
   router.navigateByUrl("/login")
   return false;
  }
  return true;
};
