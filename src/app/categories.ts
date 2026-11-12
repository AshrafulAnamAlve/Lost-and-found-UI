/**
 * The item categories, and the one rule for deciding whether an item belongs to
 * one. Both the landing page (which shows a count per category) and the browse
 * page (which shows the list) use this, so a card promising 6 watches always
 * opens a list of 6 watches.
 */

/** The four types the image classifier can name — LostAndFoundApi/MLModels/class_names.json. */
export const PHOTO_CATEGORIES = [
  { key: 'phone',      label: 'Mobile Phones', icon: 'fa-mobile-screen-button', tone: 'phone' },
  { key: 'laptop',     label: 'Laptops',       icon: 'fa-laptop',               tone: 'laptop' },
  { key: 'calculator', label: 'Calculators',   icon: 'fa-calculator',           tone: 'calc' },
  { key: 'watch',      label: 'Watches',       icon: 'fa-clock',                tone: 'watch' },
] as const;

/**
 * Buckets that say almost nothing about what the item is. A report filed under
 * one of these is allowed to be identified by its name instead — which is how a
 * wrist watch filed under "jewelry", back when the form had no Watch option,
 * still turns up under Watches.
 */
const GENERIC_BUCKETS = ['', 'other', 'jewelry', 'electronics'];

export function itemMatchesCategory(
  item: { category?: string | null; itemName?: string | null },
  key: string,
): boolean {
  const wanted = key.toLowerCase().trim();
  if (!wanted) return true;

  const category = (item.category || '').toLowerCase().trim();
  if (category === wanted) return true;

  // A specific category that disagrees is the user's own answer — respect it.
  if (!GENERIC_BUCKETS.includes(category)) return false;

  return (item.itemName || '').toLowerCase().includes(wanted);
}

/** Every category a report can be filed under, in the order the forms list them. */
export const ITEM_CATEGORIES: { value: string; label: string }[] = [
  { value: 'wallet',      label: 'Wallet / Purse' },
  { value: 'phone',       label: 'Mobile Phone' },
  { value: 'laptop',      label: 'Laptop / Tablet' },
  { value: 'calculator',  label: 'Calculator' },
  { value: 'keys',        label: 'Keys' },
  { value: 'bag',         label: 'Bag / Backpack' },
  { value: 'documents',   label: 'Documents / ID / Passport' },
  { value: 'watch',       label: 'Watch' },
  { value: 'jewelry',     label: 'Jewelry' },
  { value: 'electronics', label: 'Other Electronics' },
  { value: 'clothing',    label: 'Clothing / Shoes' },
  { value: 'other',       label: 'Other' },
];

/** "laptop" -> "Laptop / Tablet". Unknown values are shown with a capital letter. */
export function categoryLabel(value: string | null | undefined): string {
  const v = (value || '').toLowerCase().trim();
  if (!v) return '';
  return ITEM_CATEGORIES.find((c) => c.value === v)?.label ?? v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * Today's date as YYYY-MM-DD in the user's own time zone. `toISOString()` gives the
 * UTC date, which in Bangladesh (UTC+6) is still yesterday until 6 in the morning.
 */
export function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Same as localToday() for any date value the API returns. */
export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return localToday();
  const d = new Date(value);
  if (isNaN(d.getTime())) return localToday();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Strong / Possible / Weak, from the API's own label - the one rule every page uses. */
export function confidenceKey(m: { confidence?: string | null; matchPercent?: number }): 'strong' | 'possible' | 'weak' {
  const c = (m.confidence || '').toLowerCase();
  if (c === 'strong' || c === 'possible' || c === 'weak') return c;
  const p = m.matchPercent || 0;
  return p >= 72 ? 'strong' : p >= 55 ? 'possible' : 'weak';
}
