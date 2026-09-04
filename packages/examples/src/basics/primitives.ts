import type { TexarynExample } from '../types.js'

export const stringField: TexarynExample = {
  id: 'basics-string',
  title: 'String field',
  description: 'A single string field with a title and a description annotation.',
  category: 'basics',
  covers: ['schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'String field',
    properties: {
      name: {
        type: 'string',
        title: 'Name',
        description: 'Shown as help text until an error replaces or joins it.',
      },
    },
  },
  initialData: { name: '' },
}

export const numberField: TexarynExample = {
  id: 'basics-number',
  title: 'Number field',
  description:
    'A fractional number. The runtime keeps the value numeric rather than storing the string the control produced.',
  category: 'basics',
  covers: ['schema.type.number'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Number field',
    properties: {
      price: { type: 'number', title: 'Price' },
    },
  },
  initialData: { price: 9.99 },
}

export const integerField: TexarynExample = {
  id: 'basics-integer',
  title: 'Integer field',
  description: 'An integer field. Clearing it yields undefined rather than an empty string.',
  category: 'basics',
  covers: ['schema.type.integer'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Integer field',
    properties: {
      quantity: { type: 'integer', title: 'Quantity' },
    },
  },
  initialData: { quantity: 3 },
}

export const booleanField: TexarynExample = {
  id: 'basics-boolean',
  title: 'Boolean field',
  description: 'A boolean rendered as a checkbox, with its own label association.',
  category: 'basics',
  covers: ['schema.type.boolean'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Boolean field',
    properties: {
      subscribe: {
        type: 'boolean',
        title: 'Subscribe to the newsletter',
        description: 'Checkboxes carry their description as help text too.',
      },
    },
  },
  initialData: { subscribe: false },
}

export const primitiveExamples = [
  stringField,
  numberField,
  integerField,
  booleanField,
] as const
