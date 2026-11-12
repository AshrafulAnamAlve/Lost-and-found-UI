import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { session } from '../session';

@Component({
  selector: 'app-notfound',
  imports: [RouterModule],
  templateUrl: './notfound.html',
  styleUrl: './notfound.css',
})
export class Notfound {
  readonly signedIn = session.isLoggedIn();
}
