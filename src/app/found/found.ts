import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  bdPhone, brandName, colorName, meaningfulText, optional, realisticDate, strictEmail,
} from '../validators';
import { Navbar } from '../navbar/navbar';
import { ReportForm } from '../report-form';
import { localToday } from '../categories';

@Component({
  selector: 'app-found',
  imports: [Navbar, CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './found.html',
  styleUrl: './found.css',
})
export class Found extends ReportForm {
  readonly kind = 'found' as const;
  protected readonly dateKey = 'dateFound' as const;
  protected override photoRequired = true;

  form: FormGroup = new FormGroup({
    itemName:    new FormControl('', [Validators.required, meaningfulText(3, 60)]),
    type:        new FormControl('found'),
    category:    new FormControl('', Validators.required),
    location:    new FormControl('', [Validators.required, meaningfulText(3, 100)]),
    description: new FormControl('', [Validators.required, meaningfulText(15, 500, 3)]),
    dateFound:   new FormControl(localToday(), [Validators.required, realisticDate()]),
    timeLost:    new FormControl(''),
    brand:       new FormControl('', optional(brandName)),
    color:       new FormControl('', optional(colorName)),

    // Contact details come from the profile - see Lost.
    userName:    new FormControl('', [Validators.required, meaningfulText(2, 60)]),
    email:       new FormControl('', [Validators.required, strictEmail]),
    phoneNumber: new FormControl('', [Validators.required, bdPhone]),
    altContact:  new FormControl('', optional(bdPhone)),

    detectedCategory:   new FormControl<string | null>(null),
    detectedConfidence: new FormControl<number | null>(null),
  });

  protected readonly labels: Record<string, string> = {
    itemName:    'Item name',
    category:    'Category',
    location:    'Location',
    description: 'Description',
    dateFound:   'Date found',
    brand:       'Brand',
    color:       'Colour',
  };
}
