import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Shared form validation for the whole app.
 *
 * Everything here works on the *trimmed* value, so a box full of spaces counts
 * as empty rather than as valid input. Each validator returns one error key and
 * `describeError()` below turns that key into the sentence the user reads, so a
 * rule and its wording never drift apart.
 */

const text = (control: AbstractControl): string => (control.value ?? '').toString().trim();

/** Runs `check` only when something was typed — for fields that are optional. */
export function optional(check: ValidatorFn): ValidatorFn {
  return (control) => (text(control) === '' ? null : check(control));
}

// ── generic building blocks ────────────────────────────────────────────────

/** Rejects a value that is long enough but says nothing: "aaaa", "sdfghj", "....". */
function looksLikeGibberish(value: string): boolean {
  const letters = value.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return true;                          // digits/symbols only
  const distinct = new Set(value.toLowerCase().replace(/\s/g, ''));
  if (distinct.size < 3) return true;                             // "aaaa", "abab"
  if (value.length >= 5 && !/[aeiouy]/i.test(value)) return true; // "sdfghjk"
  return false;
}

/** Free text that has to read like a real phrase, not keyboard mashing. */
export function meaningfulText(min: number, max: number, minWords = 1): ValidatorFn {
  return (control) => {
    const value = text(control);
    if (!value) return null;                                      // `required` owns emptiness
    if (value.length < min) return { minLength: { requiredLength: min } };
    if (value.length > max) return { maxLength: { requiredLength: max } };
    if (value.split(/\s+/).filter(Boolean).length < minWords) {
      return { tooFewWords: { requiredWords: minWords } };
    }
    if (looksLikeGibberish(value)) return { gibberish: true };
    return null;
  };
}

// ── identity ───────────────────────────────────────────────────────────────

/** A person's name: letters and the punctuation names actually contain. */
export const personName: ValidatorFn = (control) => {
  const value = text(control);
  if (!value) return null;
  if (value.length < 2 || value.length > 50) return { nameLength: true };
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(value)) return { name: true };
  return null;
};

/** A place name — like `personName`, but digits are allowed ("Sector 10"). */
export const placeName: ValidatorFn = (control) => {
  const value = text(control);
  if (!value) return null;
  if (value.length < 2 || value.length > 60) return { nameLength: true };
  if (!/^[A-Za-z][A-Za-z0-9 .,'-]*$/.test(value)) return { place: true };
  return null;
};

/**
 * Stricter than Angular's `Validators.email`, which happily accepts "a@b".
 * Requires a real domain with a dot and a 2+ letter TLD.
 */
export const strictEmail: ValidatorFn = (control) => {
  const value = text(control);
  if (!value) return null;
  const ok =
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(value) &&
    !value.includes('..');
  return ok ? null : { email: true };
};

/**
 * A Bangladeshi mobile number, in any of the ways people write one:
 * 01712345678, +8801712345678, 8801712345678, with spaces or dashes.
 */
export const bdPhone: ValidatorFn = (control) => {
  const value = text(control).replace(/[\s\-()]/g, '');
  if (!value) return null;
  return /^(?:\+?880|0)1[3-9]\d{8}$/.test(value) ? null : { phone: true };
};

/** Loose check for values that came from a saved profile rather than from typing. */
export function looksContactable(value: string | null | undefined): boolean {
  return !!value && value.replace(/\D/g, '').length >= 6;
}

// ── item fields ────────────────────────────────────────────────────────────

const COLOR_WORDS = [
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
  'brown', 'grey', 'gray', 'silver', 'gold', 'golden', 'navy', 'maroon', 'beige',
  'cream', 'tan', 'teal', 'cyan', 'magenta', 'violet', 'indigo', 'olive', 'khaki',
  'turquoise', 'lavender', 'peach', 'mint', 'ivory', 'charcoal', 'bronze', 'copper',
  'rose', 'wine', 'sky', 'aqua', 'coral', 'salmon', 'burgundy', 'mustard', 'lime',
  'amber', 'ash', 'steel', 'rust', 'transparent', 'clear', 'multicolor', 'multicolour',
  'multicoloured', 'multicolored', 'mixed', 'rainbow', 'offwhite', 'metallic',
  'chrome', 'graphite', 'sand', 'wood', 'wooden',
];

/** Must name an actual colour — "Navy Blue" and "black with red stripes" pass, "asdf" does not. */
export const colorName: ValidatorFn = (control) => {
  const value = text(control);
  if (!value) return null;
  if (value.length > 40) return { maxLength: { requiredLength: 40 } };
  const words = value.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.some((w) => COLOR_WORDS.includes(w)) ? null : { color: true };
};

/** A brand or model: letters, digits and the punctuation product names use. */
export const brandName: ValidatorFn = (control) => {
  const value = text(control);
  if (!value) return null;
  if (value.length < 2 || value.length > 40) return { brandLength: true };
  if (!/^[A-Za-z0-9][A-Za-z0-9 .&+/'-]*$/.test(value)) return { brand: true };
  return null;
};

/** A reward: an amount, or an explicit "none". Stops "asdf" being offered as a reward. */
export const rewardValue: ValidatorFn = (control) => {
  const value = text(control).toLowerCase();
  if (!value) return null;
  if (value.length > 40) return { maxLength: { requiredLength: 40 } };
  if (/^(none|no|nil|n\/a|no reward|nothing)$/.test(value)) return null;
  const isAmount = /\d/.test(value) && /^[\d\s,.]+ ?[a-z৳]*$/.test(value);
  return isAmount ? null : { reward: true };
};

// ── dates ──────────────────────────────────────────────────────────────────

/** You cannot lose or find something tomorrow, and a date years back is a typo. */
export function realisticDate(maxYearsBack = 5): ValidatorFn {
  return (control) => {
    const value = text(control);
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) return { date: true };

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (date.getTime() > today.getTime()) return { futureDate: true };

    const oldest = new Date();
    oldest.setFullYear(oldest.getFullYear() - maxYearsBack);
    if (date.getTime() < oldest.getTime()) return { tooOld: { years: maxYearsBack } };
    return null;
  };
}

// ── error wording ──────────────────────────────────────────────────────────

/**
 * The message for whichever rule a control is failing. Returns null while the
 * control is untouched, so nothing shouts at the user before they have typed.
 */
export function describeError(control: AbstractControl | null, label: string): string | null {
  if (!control || !control.errors || !(control.touched || control.dirty)) return null;
  const e: ValidationErrors = control.errors;

  if (e['required'])     return `${label} is required`;
  if (e['email'])        return 'Enter a valid email address, e.g. name@example.com';
  if (e['phone'])        return 'Enter a valid Bangladeshi mobile number, e.g. 01712345678';
  if (e['name'])         return `${label} can only contain letters — no digits or symbols`;
  if (e['place'])        return `${label} contains characters that are not allowed`;
  if (e['nameLength'])   return `${label} must be between 2 and 50 characters`;
  if (e['color'])        return 'Name a real colour, e.g. Black, Navy Blue, Silver';
  if (e['brand'])        return 'Brand can only contain letters, digits and . & + - /';
  if (e['brandLength'])  return 'Brand must be between 2 and 40 characters';
  if (e['reward'])       return 'Enter an amount like 500 BDT, or write None';
  if (e['futureDate'])   return 'The date cannot be in the future';
  if (e['tooOld'])       return `The date cannot be more than ${e['tooOld'].years} years ago`;
  if (e['date'])         return 'Enter a valid date';
  if (e['minLength'])    return `${label} must be at least ${e['minLength'].requiredLength} characters`;
  if (e['maxLength'])    return `${label} must be under ${e['maxLength'].requiredLength} characters`;
  if (e['tooFewWords'])  return `Please write at least ${e['tooFewWords'].requiredWords} words`;
  if (e['gibberish'])    return `That does not look like a real ${label.toLowerCase()}`;
  if (e['weakPassword']) return 'Your password does not meet all the requirements yet';
  return `${label} is not valid`;
}
