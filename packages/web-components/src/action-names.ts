/**
 * Accessible names for the controls an array renders.
 *
 * A deliberate reimplementation rather than an import: this package depends on
 * no other binding. Nothing here is renderer specific, and it is now the third
 * copy, so a framework-neutral home is overdue; that move belongs in its own
 * change rather than riding along with an accessibility fix.
 *
 * The name carries the current 1-based position, because that is what a person
 * means by "the second contact"; the stable item id is implementation identity.
 * The row's own value is deliberately unused: mutable, often blank, frequently
 * duplicated, sometimes sensitive.
 */
export function removeActionName(
  position: number,
  itemTitle: string | undefined,
  arrayTitle: string | undefined,
): string {
  return withContainer(`Remove ${itemTitle ?? 'item'} ${position}`, 'from', arrayTitle)
}

export function moveUpActionName(
  position: number,
  itemTitle: string | undefined,
  arrayTitle: string | undefined,
): string {
  return withContainer(`Move up ${itemTitle ?? 'item'} ${position}`, 'in', arrayTitle)
}

export function addActionName(
  itemTitle: string | undefined,
  arrayTitle: string | undefined,
): string {
  if (arrayTitle !== undefined) return `Add item to ${arrayTitle}`
  return itemTitle === undefined ? 'Add item' : `Add ${itemTitle}`
}

function withContainer(name: string, preposition: string, arrayTitle: string | undefined): string {
  return arrayTitle === undefined ? name : `${name} ${preposition} ${arrayTitle}`
}
