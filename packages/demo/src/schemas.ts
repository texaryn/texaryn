import type { UIHints } from '@texaryn/core'

export const contactSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  title: 'Contact Form',
  properties: {
    name: { type: 'string', title: 'Full Name', minLength: 1 },
    email: { type: 'string', title: 'Email', format: 'email' },
    age: { type: 'integer', title: 'Age', minimum: 0, maximum: 150 },
    subscribe: { type: 'boolean', title: 'Subscribe to newsletter' },
    role: {
      type: 'string',
      title: 'Role',
      enum: ['developer', 'designer', 'manager', 'other'],
    },
    bio: { type: 'string', title: 'Bio', maxLength: 500 },
  },
  required: ['name', 'email'],
}

export const conditionalSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  title: 'Conditional Form',
  properties: {
    hasAddress: { type: 'boolean', title: 'I have an address' },
  },
  if: { properties: { hasAddress: { const: true } } },
  then: {
    properties: {
      street: { type: 'string', title: 'Street' },
      city: { type: 'string', title: 'City' },
      zip: { type: 'string', title: 'ZIP Code' },
    },
    required: ['street', 'city'],
  },
}

export interface SampleEntry {
  label: string
  schema: unknown
  hints?: UIHints
  initialData?: unknown
}

export const sampleSchemas: Record<string, SampleEntry> = {
  contact: {
    label: 'Contact Form',
    schema: contactSchema,
    hints: {
      '/name': { validationTrigger: 'blur' },
      '/email': { validationTrigger: 'change', placeholder: 'you@example.com' },
      '/bio': { widget: 'textarea' },
    },
    initialData: { name: '', email: '', subscribe: false },
  },
  conditional: {
    label: 'Conditional Form',
    schema: conditionalSchema,
  },
}
