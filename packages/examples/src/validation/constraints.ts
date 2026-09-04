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
}

export const constraintExamples = [
  stringConstraints,
  numericConstraints,
  arrayConstraints,
] as const
