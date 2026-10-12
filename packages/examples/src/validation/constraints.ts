import type { TexarynExample } from '../types.js'

export const stringConstraints: TexarynExample = {
  id: 'validation-string-constraints',
  title: 'String constraints',
  description:
    'Length bounds and a regular expression. The constraints reach the projection, so a renderer can reflect them without re-reading the schema.',
  category: 'validation',
  covers: [
    'schema.constraint.minLength',
    'schema.constraint.maxLength',
    'schema.constraint.pattern',
    'schema.type.string',
  ],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Credentials',
    properties: {
      username: {
        type: 'string',
        title: 'Username',
        minLength: 3,
        maxLength: 20,
      },
      postcode: {
        type: 'string',
        title: 'Postcode',
        pattern: '^[0-9]{5}$',
      },
    },
  },
  initialData: { username: 'ada', postcode: '75001' },
  presets: [
    { id: 'valid', label: 'Valid', data: { username: 'grace', postcode: '10115' } },
    { id: 'too-short', label: 'Too short', data: { username: 'ab', postcode: '75001' }, invalid: true },
    { id: 'bad-postcode', label: 'Bad postcode', data: { username: 'ada', postcode: '7500A' }, invalid: true },
  ],
}

export const numericConstraints: TexarynExample = {
  id: 'validation-numeric-constraints',
  title: 'Numeric constraints',
  description: 'Inclusive bounds on a number and on an integer.',
  category: 'validation',
  covers: [
    'schema.constraint.minimum',
    'schema.constraint.maximum',
    'schema.type.integer',
    'schema.type.number',
  ],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Measurements',
    properties: {
      age: { type: 'integer', title: 'Age', minimum: 0, maximum: 150 },
      rating: { type: 'number', title: 'Rating', minimum: 0, maximum: 5 },
    },
  },
  initialData: { age: 39, rating: 4.5 },
  presets: [
    { id: 'valid', label: 'Valid', data: { age: 30, rating: 3 } },
    { id: 'out-of-range', label: 'Out of range', data: { age: 200, rating: 7 }, invalid: true },
  ],
}

export const exclusiveNumericConstraints: TexarynExample = {
  id: 'validation-exclusive-numeric-constraints',
  title: 'Exclusive bounds and multiples',
  description:
    'Bounds that exclude their own endpoint, and a step the value must be a multiple of. All three reach the projection alongside the inclusive bounds.',
  category: 'validation',
  covers: [
    'schema.constraint.exclusiveMinimum',
    'schema.constraint.exclusiveMaximum',
    'schema.constraint.multipleOf',
    'schema.type.number',
    'schema.type.integer',
  ],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Pricing',
    properties: {
      discount: {
        type: 'number',
        title: 'Discount',
        exclusiveMinimum: 0,
        exclusiveMaximum: 1,
      },
      quantity: { type: 'integer', title: 'Quantity', multipleOf: 12 },
    },
  },
  initialData: { discount: 0.25, quantity: 24 },
  presets: [
    { id: 'valid', label: 'Valid', data: { discount: 0.5, quantity: 36 } },
    { id: 'on-the-bounds', label: 'On the bounds', data: { discount: 1, quantity: 10 }, invalid: true },
  ],
}

export const arrayConstraints: TexarynExample = {
  id: 'validation-array-constraints',
  title: 'Array constraints',
  description:
    'Bounds on how many items an array may hold, and a uniqueness requirement across them.',
  category: 'validation',
  covers: [
    'schema.constraint.minItems',
    'schema.constraint.maxItems',
    'schema.constraint.uniqueItems',
    'schema.type.array',
  ],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Skills',
    properties: {
      skills: {
        type: 'array',
        title: 'Skills',
        minItems: 1,
        maxItems: 5,
        uniqueItems: true,
        items: { type: 'string', title: 'Skill' },
      },
    },
  },
  initialData: { skills: ['typescript', 'accessibility'] },
  presets: [
    { id: 'valid', label: 'One skill', data: { skills: ['typescript'] } },
    { id: 'empty', label: 'Empty', data: { skills: [] }, invalid: true },
    { id: 'duplicates', label: 'Duplicates', data: { skills: ['css', 'css'] }, invalid: true },
  ],
}

export const constraintExamples = [
  stringConstraints,
  numericConstraints,
  exclusiveNumericConstraints,
  arrayConstraints,
] as const
