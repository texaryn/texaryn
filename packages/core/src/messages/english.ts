import type { FormMessages } from './types.js'

function withContainer(name: string, preposition: string, containerTitle: string | undefined): string {
  return containerTitle === undefined ? name : `${name} ${preposition} ${containerTitle}`
}

/** Names carry the row's 1-based position, never its value: mutable, often blank, sometimes sensitive. */
export const englishMessages: FormMessages & Required<Pick<FormMessages, 'expandBoundary'>> = {
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
  moveItemDown: ({ position, itemTitle, containerTitle }) => ({
    label: 'Down',
    accessibleName: withContainer(`Move down ${itemTitle ?? 'item'} ${position}`, 'in', containerTitle),
  }),
  expandBoundary: ({ boundary, containerTitle, position, count }) => ({
    label: boundary === 'recursion' ? 'Expand' : 'Show more fields',
    accessibleName:
      boundary === 'recursion'
        ? withContainer(
            `${count > 1 ? `Expand recursive fields ${position}` : 'Expand recursive fields'}`,
            'in',
            containerTitle,
          )
        : withContainer(
            `${count > 1 ? `Show more fields ${position}` : 'Show more fields'}`,
            'in',
            containerTitle,
          ),
  }),
  requiredIndicator: () => ({ text: '(required)', placement: 'after' }),
  errorSummaryHeading: ({ count }) => (count === 1 ? 'There is a problem' : `There are ${count} problems`),
  errorSummaryDetail: ({ messages }) => `: ${messages.join(', ')}`,
}
