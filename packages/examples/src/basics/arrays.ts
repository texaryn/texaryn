import type { TexarynExample } from '../types.js'

export const arrayOfPrimitives: TexarynExample = {
  id: 'basics-array-primitives',
  title: 'Array of primitives',
  description:
    'A list of strings with add and remove. Items keep a stable identity across reorders, so focus and state follow the item rather than the index.',
  category: 'basics',
  covers: ['schema.type.array', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Tags',
    properties: {
      tags: {
        type: 'array',
        title: 'Tags',
        items: { type: 'string', title: 'Tag' },
      },
    },
  },
  initialData: { tags: ['forms', 'schema'] },
}

export const arrayOfObjects: TexarynExample = {
  id: 'basics-array-objects',
  title: 'Array of objects',
  description: 'A list whose items are objects, so each row renders a group of fields.',
  category: 'basics',
  covers: ['schema.array.of-objects', 'schema.type.array', 'schema.type.object'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Contacts',
    properties: {
      contacts: {
        type: 'array',
        title: 'Contacts',
        items: {
          type: 'object',
          title: 'Contact',
          properties: {
            name: { type: 'string', title: 'Name' },
            email: { type: 'string', title: 'Email', format: 'email' },
          },
        },
      },
    },
  },
  initialData: {
    contacts: [{ name: 'Ada', email: 'ada@example.com' }],
  },
}

export const arrayExamples = [arrayOfPrimitives, arrayOfObjects] as const
