import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  bdPhone, brandName, colorName, meaningfulText, optional, realisticDate, rewardValue, strictEmail,
} from '../validators';
import { Navbar } from '../navbar/navbar';
import { ReportForm } from '../report-form';
import { localToday } from '../categories';

@Component({
  selector: 'app-lost',
  imports: [Navbar, ReactiveFormsModule, CommonModule, RouterModule],
  templateUrl: './lost.html',
  styleUrl: './lost.css',
})
export class Lost extends ReportForm {
  readonly kind = 'lost' as const;
  protected readonly dateKey = 'dateLost' as const;

  form: FormGroup = new FormGroup({
    itemName:    new FormControl('', [Validators.required, meaningfulText(3, 60)]),
    type:        new FormControl('lost'),
    category:    new FormControl('', Validators.required),
    location:    new FormControl('', [Validators.required, meaningfulText(3, 100)]),
    description: new FormControl('', [Validators.required, meaningfulText(15, 500, 3)]),
    dateLost:    new FormControl(localToday(), [Validators.required, realisticDate()]),
    timeLost:    new FormControl(''),
    brand:       new FormControl('', optional(brandName)),
    color:       new FormControl('', [Validators.required, colorName]),
    Reward:      new FormControl('', optional(rewardValue)),

    // Contact details are never typed here - they come from the signed-in user's
    // profile (and the API takes them from the profile again, whatever is sent).
    userName:    new FormControl('', [Validators.required, meaningfulText(2, 60)]),
    email:       new FormControl('', [Validators.required, strictEmail]),
    phoneNumber: new FormControl('', [Validators.required, bdPhone]),
    altContact:  new FormControl('', optional(bdPhone)),

    // What the image classifier saw, sent with the item so the very first match
    // pass can use it. Separate from `category`: that is the user's answer, this is
    // the model's, and the matching engine weighs them very differently.
    detectedCategory:   new FormControl<string | null>(null),
    detectedConfidence: new FormControl<number | null>(null),
  });

  protected readonly labels: Record<string, string> = {
    itemName:    'Item name',
    category:    'Category',
    location:    'Location',
    description: 'Description',
    dateLost:    'Date lost',
    brand:       'Brand',
    color:       'Colour',
    Reward:      'Reward',
  };
}
