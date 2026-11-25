import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Notfound } from './notfound/notfound';
import { Dashbord } from './dashbord/dashbord';
import { adminGuard, authGuard } from './auth-guard';
import { Admin } from './admin/admin';
import { Lost } from './lost/lost';
import { Found } from './found/found';
import { Reports } from './reports/reports';
import { ProductDetails } from './product-details/product-details';
import { Profile } from './profile/profile';
import { Matches } from './matches/matches';
import { Messages } from './messages/messages';

const name = (page: string) => `${page} | Lost & Found BUBT`;

export const routes: Routes = [
  { path: '',                          redirectTo: 'login', pathMatch: 'full' },
  { path: 'login',                     component: Login,          title: 'Lost & Found BUBT | Find what you lost' },
  { path: 'dashbord',                  component: Dashbord,       canActivate: [authGuard], title: name('Dashboard') },
  { path: 'lost',                      component: Lost,           canActivate: [authGuard], title: name('Report a lost item') },
  { path: 'lost/edit/:id',             component: Lost,           canActivate: [authGuard], title: name('Edit lost report') },
  { path: 'found',                     component: Found,          canActivate: [authGuard], title: name('Report a found item') },
  { path: 'found/edit/:id',            component: Found,          canActivate: [authGuard], title: name('Edit found report') },
  { path: 'reports',                   component: Reports,        canActivate: [authGuard], title: name('Browse items') },
  { path: 'matches',                   component: Matches,        canActivate: [authGuard], title: name('Match results') },
  { path: 'messages',                  component: Messages,       canActivate: [authGuard], title: name('Messages') },
  { path: 'productDetails/:type/:id',  component: ProductDetails, canActivate: [authGuard], title: name('Item details') },
  { path: 'profile',                   component: Profile,        canActivate: [authGuard], title: name('My profile') },
  { path: 'admin',                     component: Admin,          canActivate: [adminGuard], title: name('Admin Panel') },
  { path: '**',                        component: Notfound,       title: name('Page not found') },
];
