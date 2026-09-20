import type { FormMessages } from './types.js'

function withContainer(name: string, preposition: string, containerTitle: string | undefined): string {
  return containerTitle === undefined ? name : `${name} ${preposition} ${containerTitle}`
}

/**
 * The name carries the current 1-based position, because that is what a
 * person means by "the second contact". The row's own value is deliberately
 * unused: mutable, often blank, frequently duplicated, sometimes sensitive.
 */
export const englishMessages: FormMessages = {
  addItem: ({ itemTemplateTitle, containerTitle }) => ({
    label: 'Add',
    accessibleName:
      containerTitle !== undefined
        ? `Add item to ${containerTitle}`
        : itemTemplateTitle === undefined
          ? 'Add item'
          : `Add ${itemTemplateTitle}`,
  }),
  removeItem: ({ position, itemTitle, containerTitle }) => ({
    label: 'Remove',
    accessibleName: withContainer(`Remove ${itemTitle ?? 'item'} ${position}`, 'from', containerTitle),
  }),
  moveItemUp: ({ position, itemTitle, containerTitle }) => ({
    label: 'Up',
    accessibleName: withContainer(`Move up ${itemTitle ?? 'item'} ${position}`, 'in', containerTitle),
  }),
  requiredIndicator: () => ({ text: '(required)', placement: 'after' }),
}
