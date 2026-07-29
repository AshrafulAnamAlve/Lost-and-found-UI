import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Notfound } from './notfound/notfound';
import { FormsModule } from '@angular/forms';
import { Call } from './call/call';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FormsModule, Call],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('LostandFoundUI');
}
