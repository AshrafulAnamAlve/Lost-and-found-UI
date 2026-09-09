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
