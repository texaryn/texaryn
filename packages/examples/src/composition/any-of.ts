import type { TexarynExample } from '../types.js'

export const anyOfAlternatives: TexarynExample = {
  id: 'composition-any-of',
  title: 'anyOf',
  description:
    'A value that may satisfy more than one alternative at once. Unlike oneOf, matching several is legal, so the projection resolves the field against whichever alternatives the current data satisfies.',
  category: 'composition',
  covers: ['schema.composition.anyOf', 'schema.type.string', 'schema.type.number'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Flexible value',
    properties: {
      value: {
        title: 'Value',
        anyOf: [
          { type: 'string', title: 'Text value', minLength: 1 },
          { type: 'number', title: 'Numeric value', minimum: 0 },
        ],
      },
    },
  },
  initialData: { value: 'hello' },
}

export const anyOfExamples = [anyOfAlternatives] as const
