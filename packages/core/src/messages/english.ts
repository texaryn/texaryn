import type { FormMessages } from './types.js'
import type { ValidationError } from '../types.js'

function withContainer(name: string, preposition: string, containerTitle: string | undefined): string {
  return containerTitle === undefined ? name : `${name} ${preposition} ${containerTitle}`
}

function limitFor(error: ValidationError): number | undefined {
  const value = error.params.limit
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function validationMessage(error: ValidationError): string {
  const limit = limitFor(error)
  switch (error.keyword) {
    case 'required':
      return 'This field is required.'
    case 'minLength':
      return limit === undefined ? 'This value is too short.' : `Enter at least ${limit} characters.`
    case 'maxLength':
      return limit === undefined ? 'This value is too long.' : `Enter no more than ${limit} characters.`
    case 'minimum':
      return limit === undefined ? 'This value is below the minimum.' : `Enter a value of at least ${limit}.`
    case 'exclusiveMinimum':
      return limit === undefined ? 'This value must be above the minimum.' : `Enter a value greater than ${limit}.`
    case 'maximum':
      return limit === undefined ? 'This value is above the maximum.' : `Enter a value of at most ${limit}.`
    case 'exclusiveMaximum':
      return limit === undefined ? 'This value must be below the maximum.' : `Enter a value less than ${limit}.`
    case 'minItems':
      return limit === undefined ? 'Add more items.' : `Add at least ${limit} items.`
    case 'maxItems':
      return limit === undefined ? 'Remove some items.' : `Use no more than ${limit} items.`
    case 'minProperties':
      return limit === undefined ? 'Add more fields.' : `Provide at least ${limit} fields.`
    case 'maxProperties':
      return limit === undefined ? 'Remove some fields.' : `Provide no more than ${limit} fields.`
    case 'format':
      if (error.params.format === 'email') return 'Enter a valid email address.'
      if (error.params.format === 'uri' || error.params.format === 'url') return 'Enter a valid URL.'
      if (error.params.format === 'date') return 'Enter a valid date.'
      if (error.params.format === 'date-time') return 'Enter a valid date and time.'
      return 'Enter a value in the required format.'
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
