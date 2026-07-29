import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Notfound } from './notfound/notfound';
import { Dashbord } from './dashbord/dashbord';
import { authGuard } from './auth-guard';
import { Lost } from './lost/lost';
import { Found } from './found/found';
import { Reports } from './reports/reports';
import { ProductDetails } from './product-details/product-details';
import { Profile } from './profile/profile';
import { Matches } from './matches/matches';
import { Messages } from './messages/messages';

export const routes: Routes = [
  { path: '',                          redirectTo: 'login', pathMatch: 'full' },
  { path: 'login',                     component: Login },
  { path: 'dashbord',                  component: Dashbord,        canActivate: [authGuard] },
  { path: 'lost',                      component: Lost,             canActivate: [authGuard] },
  { path: 'found',                     component: Found,            canActivate: [authGuard] },
  { path: 'reports',                   component: Reports,          canActivate: [authGuard] },
  { path: 'matches',                   component: Matches,          canActivate: [authGuard] },
  { path: 'messages',                  component: Messages,         canActivate: [authGuard] },
  { path: 'productDetails/:type/:id',  component: ProductDetails,   canActivate: [authGuard] },
  { path: 'profile',                   component: Profile,          canActivate: [authGuard] },
  { path: '**',                        component: Notfound },
];
