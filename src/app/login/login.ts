import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { API_BASE } from '../api';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements AfterViewInit {
  showLogin = false;
  showSignup = false;
  http = inject(HttpClient);
  router = inject(Router);
  snackBar = inject(MatSnackBar);

  RegisterForm: FormGroup = new FormGroup({
    firstName:     new FormControl('', Validators.required),
    lastName:      new FormControl('', Validators.required),
    email:         new FormControl('', [Validators.required, Validators.email]),
    password:      new FormControl('', Validators.required),
    phone:         new FormControl('', Validators.required),
    address:       new FormControl('', Validators.required),
    city:          new FormControl('', Validators.required),
    secondaryPhone: new FormControl(''),
  });

  loginForm: FormGroup = new FormGroup({
    email:    new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', Validators.required),
  });

  ngAfterViewInit(): void {
    this.createParticles();
  }

  private createParticles(): void {
    const container = document.getElementById('particles');
    if (!container) return;
    const colors = ['rgba(233,69,96,.3)', 'rgba(26,188,156,.3)', 'rgba(52,152,219,.3)', 'rgba(243,156,18,.3)'];
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const s = Math.random() * 12 + 4;
      p.style.cssText = `width:${s}px;height:${s}px;left:${Math.random() * 100}%;top:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation-delay:${Math.random() * 6}s;animation-duration:${4 + Math.random() * 6}s`;
      container.appendChild(p);
    }
  }

  onRegister() {
    if (this.RegisterForm.invalid) {
      this.snackBar.open('Please fill all required fields', 'Ok', { duration: 3000, verticalPosition: 'top' });
      return;
    }
    this.http.post(`${API_BASE}/Register`, this.RegisterForm.value, { responseType: 'text' }).subscribe({
      next: (res: string) => {
        if (res === 'Registration successful') {
          this.snackBar.open('Account created! Please sign in.', 'Ok', { duration: 4000, verticalPosition: 'top' });
          this.RegisterForm.reset();
          this.openLogin();
        }
      },
      error: () => {
        this.snackBar.open('Something went wrong', 'Ok', { duration: 3000, verticalPosition: 'top' });
      },
    });
  }

  onLogin() {
    if (this.loginForm.invalid) {
      this.snackBar.open('Please enter valid credentials', 'Ok', { duration: 3000, verticalPosition: 'top' });
      return;
    }
    this.http.post(`${API_BASE}/login`, this.loginForm.value).subscribe({
      next: (res: any) => {
        if (res.message === 'Login Successfull') {
          localStorage.setItem('isLoggedin', 'token');
          localStorage.setItem('userid', res.userid);
          if (res.firstName || res.lastName) {
            localStorage.setItem('username', `${res.firstName || ''} ${res.lastName || ''}`.trim());
          }
          this.snackBar.open('Welcome back! 👋', 'Ok', { duration: 3000 });
          this.router.navigateByUrl('/dashbord');
        }
      },
      error: () => {
        this.snackBar.open('Incorrect email or password', 'Ok', { duration: 3000, verticalPosition: 'top' });
      },
    });
  }

  openLogin()  { this.showLogin = true;  this.showSignup = false; }
  openSignup() { this.showSignup = true; this.showLogin = false; }
  closeModal() { this.showLogin = false; this.showSignup = false; }
}
