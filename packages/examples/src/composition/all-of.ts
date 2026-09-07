import type { TexarynExample } from '../types.js'

export const allOfComposition: TexarynExample = {
  id: 'composition-all-of',
  title: 'allOf composition',
  description:
    'Every branch contributes its properties at once, unlike anyOf and oneOf where the current data selects one. The form shows the union of all three.',
  category: 'composition',
  covers: ['schema.composition.allOf', 'schema.type.object', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Shipment',
    allOf: [
      {
        properties: {
          recipient: { type: 'string', title: 'Recipient' },
        },
      },
      {
        properties: {
          street: { type: 'string', title: 'Street' },
        },
      },
    ],
    properties: {
      reference: { type: 'string', title: 'Reference' },
    },
  },
  initialData: { reference: 'SHP-1', recipient: 'Ada Lovelace', street: '12 Rue Neuve' },
}

export const allOfExamples = [allOfComposition] as const
