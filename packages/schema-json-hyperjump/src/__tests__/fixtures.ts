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

export const recursiveRefSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $defs: {
    treeNode: {
      type: 'object',
      properties: {
        label: { type: 'string', title: 'Label' },
        children: {
          type: 'array',
          items: { $ref: '#/$defs/treeNode' },
        },
      },
      required: ['label'],
    },
  },
  type: 'object',
  properties: {
    root: { $ref: '#/$defs/treeNode' },
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

export const draft201909Schema = {
  $schema: 'https://json-schema.org/draft/2019-09/schema',
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    age: { type: 'integer', title: 'Age', minimum: 0 },
  },
  required: ['name'],
} as const

export const draft202012Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    age: { type: 'integer', title: 'Age', minimum: 0 },
  },
  required: ['name'],
} as const

export const ifThenElseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    accountType: { type: 'string', enum: ['personal', 'business'] },
    name: { type: 'string', title: 'Name' },
  },
  required: ['accountType', 'name'],
  if: {
    properties: { accountType: { const: 'business' } },
    required: ['accountType'],
  },
  then: {
    properties: {
      companyName: { type: 'string', title: 'Company Name' },
      taxId: { type: 'string', title: 'Tax ID' },
    },
    required: ['companyName'],
  },
  else: {
    properties: {
      nickname: { type: 'string', title: 'Nickname' },
    },
  },
} as const

export const oneOfSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['circle', 'rectangle'] },
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
} as const

export const dependentSchemasSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    creditCard: { type: 'string', title: 'Credit Card' },
  },
  dependentSchemas: {
    creditCard: {
      properties: {
        cvv: { type: 'string', title: 'CVV', minLength: 3, maxLength: 4 },
      },
      required: ['cvv'],
    },
  },
} as const

export const anyOfSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    value: {
      anyOf: [
        { type: 'string', title: 'Text Value', minLength: 1 },
        { type: 'number', title: 'Numeric Value', minimum: 0 },
      ],
    },
  },
} as const

export const allOfSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  allOf: [
    {
      properties: {
        name: { type: 'string', title: 'Name', minLength: 1 },
      },
      required: ['name'],
    },
    {
      properties: {
        age: { type: 'integer', title: 'Age', minimum: 0 },
      },
    },
  ],
} as const

export const draft07DependenciesSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    creditCard: { type: 'string', title: 'Credit Card' },
  },
  dependencies: {
    creditCard: {
      properties: {
        billingAddress: { type: 'string', title: 'Billing Address' },
      },
      required: ['billingAddress'],
    },
  },
} as const

export const arrayItemsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      items: { type: 'string', title: 'Tag', minLength: 1 },
    },
    coordinates: {
      type: 'array',
      prefixItems: [
        { type: 'number', title: 'Latitude' },
        { type: 'number', title: 'Longitude' },
      ],
    },
  },
} as const

export const nullableTypeSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    middleName: { type: ['null', 'string'], title: 'Middle Name' },
  },
} as const

export const recursiveObjectRefSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $defs: {
    node: {
      type: 'object',
      properties: {
        name: { type: 'string', title: 'Name' },
        next: { $ref: '#/$defs/node' },
      },
    },
  },
  $ref: '#/$defs/node',
} as const

export const specialKeySchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    'a/b': { type: 'string', title: 'Slash Key' },
    'c~d': { type: 'string', title: 'Tilde Key' },
  },
} as const
