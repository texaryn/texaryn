import type { TexarynExample } from '../types.js'

export const flatObject: TexarynExample = {
  id: 'basics-object',
  title: 'Object',
  description: 'An object with several properties of different types, rendered as one group.',
  category: 'basics',
  covers: ['schema.type.object', 'schema.type.string', 'schema.type.integer'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Person',
    properties: {
      firstName: { type: 'string', title: 'First name' },
      lastName: { type: 'string', title: 'Last name' },
      age: { type: 'integer', title: 'Age' },
    },
  },
  initialData: { firstName: '', lastName: '', age: 0 },
}

export const nestedObject: TexarynExample = {
  id: 'basics-object-nested',
  title: 'Nested object',
  description:
    'An object inside an object. Each level keeps its own pointer, so field identity stays stable as the tree grows.',
  category: 'basics',
  covers: ['schema.object.nested', 'schema.type.object', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Account',
    properties: {
      username: { type: 'string', title: 'Username' },
      address: {
        type: 'object',
        title: 'Address',
        properties: {
          street: { type: 'string', title: 'Street' },
          city: { type: 'string', title: 'City' },
          country: { type: 'string', title: 'Country' },
        },
      },
    },
  },
  initialData: {
    username: '',
    address: { street: '', city: '', country: '' },
  },
}

export const deeplyNestedObject: TexarynExample = {
  id: 'basics-object-deeply-nested',
  title: 'Deeply nested object',
  description: 'Three levels of nesting, to show the projection does not flatten structure.',
  category: 'basics',
  covers: ['schema.object.nested', 'schema.type.object'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Organisation',
    properties: {
      company: {
        type: 'object',
        title: 'Company',
        properties: {
          name: { type: 'string', title: 'Company name' },
          headquarters: {
            type: 'object',
            title: 'Headquarters',
            properties: {
              city: { type: 'string', title: 'City' },
              country: { type: 'string', title: 'Country' },
            },
          },
        },
      },
    },
  },
  initialData: {
    company: { name: '', headquarters: { city: '', country: '' } },
  },
}

export const objectExamples = [flatObject, nestedObject, deeplyNestedObject] as const
