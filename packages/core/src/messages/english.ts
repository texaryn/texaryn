import type { FormMessages } from './types.js'
import type { ValidationError } from '../types.js'

function withContainer(name: string, preposition: string, containerTitle: string | undefined): string {
  return containerTitle === undefined ? name : `${name} ${preposition} ${containerTitle}`
}

function limitFor(error: ValidationError): number | undefined {
  const value = error.params.limit
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

interface LimitMessage {
  readonly withoutLimit: string
  readonly withLimit: (limit: number) => string
}

const LIMIT_MESSAGES: Readonly<Record<string, LimitMessage>> = {
  minLength: { withoutLimit: 'This value is too short.', withLimit: (limit) => `Enter at least ${limit} characters.` },
  maxLength: { withoutLimit: 'This value is too long.', withLimit: (limit) => `Enter no more than ${limit} characters.` },
  minimum: { withoutLimit: 'This value is below the minimum.', withLimit: (limit) => `Enter a value of at least ${limit}.` },
  exclusiveMinimum: { withoutLimit: 'This value must be above the minimum.', withLimit: (limit) => `Enter a value greater than ${limit}.` },
  maximum: { withoutLimit: 'This value is above the maximum.', withLimit: (limit) => `Enter a value of at most ${limit}.` },
  exclusiveMaximum: { withoutLimit: 'This value must be below the maximum.', withLimit: (limit) => `Enter a value less than ${limit}.` },
  minItems: { withoutLimit: 'Add more items.', withLimit: (limit) => `Add at least ${limit} items.` },
  maxItems: { withoutLimit: 'Remove some items.', withLimit: (limit) => `Use no more than ${limit} items.` },
  minProperties: { withoutLimit: 'Add more fields.', withLimit: (limit) => `Provide at least ${limit} fields.` },
  maxProperties: { withoutLimit: 'Remove some fields.', withLimit: (limit) => `Provide no more than ${limit} fields.` },
}

function limitValidationMessage(keyword: string, limit: number | undefined): string | undefined {
  const message = Object.hasOwn(LIMIT_MESSAGES, keyword)
    ? LIMIT_MESSAGES[keyword]
    : undefined
  if (!message) return undefined
  return limit === undefined ? message.withoutLimit : message.withLimit(limit)
}

function formatValidationMessage(format: unknown): string {
  if (format === 'email') return 'Enter a valid email address.'
  if (format === 'uri' || format === 'url') return 'Enter a valid URL.'
  if (format === 'date') return 'Enter a valid date.'
  if (format === 'date-time') return 'Enter a valid date and time.'
  return 'Enter a value in the required format.'
}

function validationMessage(error: ValidationError): string {
  const limitedMessage = limitValidationMessage(error.keyword, limitFor(error))
  if (limitedMessage !== undefined) return limitedMessage
  switch (error.keyword) {
    case 'required':
      return 'This field is required.'
    case 'format':
      return formatValidationMessage(error.params.format)
    case 'pattern':
      return 'Enter a value in the required format.'
    case 'type':
      return 'Enter a value of the expected type.'
    case 'enum':
    case 'const':
      return 'Choose an allowed value.'
    case 'uniqueItems':
      return 'Each item must be unique.'
    case 'dependentRequired':
      return 'Complete the related required fields.'
    case 'additionalProperties':
      return 'Remove unrecognized fields.'
    case 'oneOf':
    case 'anyOf':
      return 'Choose a value that matches an allowed option.'
    default:
      return 'This value is invalid.'
  }
}

/** Names carry the row's 1-based position, never its value: mutable, often blank, sometimes sensitive. */
function addItemAccessibleName(itemTemplateTitle: string | undefined, containerTitle: string | undefined): string {
  if (containerTitle !== undefined) return `Add item to ${containerTitle}`
  if (itemTemplateTitle === undefined) return 'Add item'
  return `Add ${itemTemplateTitle}`
}

function boundaryAccessibleName(
  boundary: 'recursion' | 'budget',
  containerTitle: string | undefined,
  position: number,
  count: number,
): string {
  const title = boundary === 'recursion' ? 'Expand recursive fields' : 'Show more fields'
  const name = count > 1 ? `${title} ${position}` : title
  return withContainer(name, 'in', containerTitle)
}

export const englishMessages: FormMessages & Required<Pick<FormMessages, 'expandBoundary'>> = {
  addItem: ({ itemTemplateTitle, containerTitle }) => ({
    label: 'Add',
    accessibleName: addItemAccessibleName(itemTemplateTitle, containerTitle),
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
    accessibleName: boundaryAccessibleName(boundary, containerTitle, position, count),
  }),
  requiredIndicator: () => ({ text: '(required)', placement: 'after' }),
  errorSummaryHeading: ({ count }) => (count === 1 ? 'There is a problem' : `There are ${count} problems`),
  errorSummaryDetail: ({ messages }) => `: ${messages.join(', ')}`,
  fieldLabel: ({ fieldName, itemPosition }) =>
    fieldName ?? (itemPosition === undefined ? 'Field' : `Item ${itemPosition}`),
  validationMessage,
}
