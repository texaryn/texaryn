import type { TexarynExample } from '../types.js'

export const localRef: TexarynExample = {
  id: 'reference-local-ref',
  title: 'Local $ref',
  description:
    'A property whose schema is a $ref into $defs. The referenced fields appear in the projection as if they had been written inline.',
  category: 'references',
  covers: ['schema.reference.local-ref', 'schema.type.object'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $defs: {
      address: {
        type: 'object',
        title: 'Address',
        properties: {
          street: { type: 'string', title: 'Street' },
          city: { type: 'string', title: 'City' },
        },
      },
    },
    type: 'object',
    title: 'Delivery',
    properties: {
      home: { $ref: '#/$defs/address' },
    },
  },
  initialData: { home: { street: '', city: '' } },
}

export const reusedFragment: TexarynExample = {
  id: 'reference-reused-fragment',
  title: 'Reused $defs fragment',
  description:
    'One definition referenced by two properties. Each gets its own independent subtree rather than sharing state, which is what makes a reused fragment safe to edit in one place.',
  category: 'references',
  covers: [
    'schema.reference.reused-fragment',
    'schema.reference.local-ref',
    'schema.type.object',
  ],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $defs: {
      address: {
        type: 'object',
        title: 'Address',
        properties: {
          street: { type: 'string', title: 'Street' },
          city: { type: 'string', title: 'City' },
        },
      },
    },
    type: 'object',
    title: 'Addresses',
    properties: {
      home: { $ref: '#/$defs/address' },
      work: { $ref: '#/$defs/address' },
    },
  },
  initialData: {
    home: { street: 'Home street', city: 'Home city' },
    work: { street: 'Work street', city: 'Work city' },
  },
}

export const referenceExamples = [localRef, reusedFragment] as const
