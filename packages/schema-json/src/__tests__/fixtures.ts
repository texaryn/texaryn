export const flatObjectSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  title: 'User',
  properties: {
    name: { type: 'string', title: 'Name', minLength: 1, maxLength: 100 },
    email: { type: 'string', title: 'Email', format: 'email' },
    age: { type: 'integer', title: 'Age', minimum: 0, maximum: 150 },
    active: { type: 'boolean', title: 'Active', default: true },
  },
  required: ['name', 'email'],
} as const

export const enumSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    color: {
      type: 'string',
      title: 'Color',
      enum: ['red', 'green', 'blue'],
    },
  },
} as const

export const nestedObjectSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
        city: { type: 'string', title: 'City' },
      },
      required: ['street'],
    },
  },
} as const

export const arraySchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      title: 'Tags',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 10,
    },
  },
} as const

export const objectArraySchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    contacts: {
      type: 'array',
      title: 'Contacts',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Contact Name' },
          phone: { type: 'string', title: 'Phone' },
        },
        required: ['name'],
      },
    },
  },
} as const

export const refSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $defs: {
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
        city: { type: 'string', title: 'City' },
      },
      required: ['street'],
    },
  },
  type: 'object',
  properties: {
    home: { $ref: '#/$defs/address' },
    work: { $ref: '#/$defs/address' },
  },
} as const

export const draft07Schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    age: { type: 'integer', title: 'Age', minimum: 0 },
  },
  required: ['name'],
} as const

export const annotationsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    field: {
      type: 'string',
      title: 'Annotated Field',
      description: 'A field with all annotations',
      readOnly: true,
      writeOnly: false,
      deprecated: true,
      examples: ['example1', 'example2'],
      default: 'default-value',
    },
  },
} as const
