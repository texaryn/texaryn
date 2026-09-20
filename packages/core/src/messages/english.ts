import type { FormMessages } from './types.js'

function withContainer(name: string, preposition: string, containerTitle: string | undefined): string {
  return containerTitle === undefined ? name : `${name} ${preposition} ${containerTitle}`
}

/** Names carry the row's 1-based position, never its value: mutable, often blank, sometimes sensitive. */
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
