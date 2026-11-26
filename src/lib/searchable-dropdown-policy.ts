/**
 * Plan Do-now: dropdown lists must not open by themselves on tab-focus —
 * they cover the screen and make it easy to pick the wrong record.
 * Open on click, typing, or arrow navigation only.
 */
export type SearchableDropdownOpenTrigger = 'focus' | 'click' | 'change' | 'arrow';

export function searchableDropdownOpensFor(
  trigger: SearchableDropdownOpenTrigger,
): boolean {
  return trigger !== 'focus';
}
