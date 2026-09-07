/**
 * Accessible names for the controls an array renders.
 *
 * Five identical "Remove" buttons tell a screen reader user nothing about
 * which row they act on. The name carries the current 1-based position, which
 * is what a person means by "the second contact"; the stable item id is
 * implementation identity and means nothing to them.
 *
 * The row's own value is deliberately not used. It is mutable, often blank,
 * frequently duplicated, sometimes long, and sometimes sensitive.
 *
 * Titles come from the schema: the array's own title, and the item title,
 * which repeats across rows and so cannot distinguish them on its own. Each
 * name degrades cleanly as those go missing.
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
