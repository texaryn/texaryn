import type { TexarynExample } from '../types.js'

export const stringEnum: TexarynExample = {
  id: 'basics-enum-string',
  title: 'String enum',
  description:
    'A closed set of string values, rendered as a select. The chosen option is stored as the schema value, not as its label.',
  category: 'basics',
  covers: ['schema.enum.string', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Role',
    properties: {
      role: {
        type: 'string',
        title: 'Role',
        enum: ['developer', 'designer', 'manager'],
      },
    },
  },
  initialData: { role: 'developer' },
}

export const requiredAndOptional: TexarynExample = {
  id: 'basics-required',
  title: 'Required and optional',
  description:
    'One required field beside an optional one. Required fields carry aria-required, never the native required attribute, so the browser does not run its own validation ahead of Texaryn.',
  category: 'basics',
  covers: ['schema.field.required', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Sign up',
    properties: {
      email: { type: 'string', title: 'Email', format: 'email' },
      referral: { type: 'string', title: 'How did you hear about us?' },
    },
    required: ['email'],
  },
  initialData: { email: '', referral: '' },
}

export const enumAndRequiredExamples = [stringEnum, requiredAndOptional] as const
