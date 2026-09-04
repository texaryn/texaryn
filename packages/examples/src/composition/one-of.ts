import type { TexarynExample } from '../types.js'

export const oneOfDiscriminated: TexarynExample = {
  id: 'composition-one-of',
  title: 'oneOf',
  description:
    'A discriminated union. The kind field selects exactly one alternative, and only that alternative’s fields are active.',
  category: 'composition',
  covers: ['schema.composition.oneOf', 'schema.enum.string', 'schema.type.number'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Shape',
    properties: {
      kind: { type: 'string', title: 'Kind', enum: ['circle', 'rectangle'] },
    },
    required: ['kind'],
    oneOf: [
      {
        properties: {
          kind: { const: 'circle' },
          radius: { type: 'number', title: 'Radius', minimum: 0 },
        },
        required: ['radius'],
      },
      {
        properties: {
          kind: { const: 'rectangle' },
          width: { type: 'number', title: 'Width', minimum: 0 },
          height: { type: 'number', title: 'Height', minimum: 0 },
        },
        required: ['width', 'height'],
      },
    ],
  },
  initialData: { kind: 'circle', radius: 5 },
}

export const oneOfExamples = [oneOfDiscriminated] as const
