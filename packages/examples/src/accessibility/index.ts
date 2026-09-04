// Renderer-neutral scenarios. These are data like every other example: no
// React, no design system, no DOM assertions. The semantic proof that each
// renderer implements them correctly belongs to the shared renderer
// conformance suites, which is what `verification: 'renderer'` records on
// these capabilities.
//
// They earn their place here because they are among the most useful things to
// look at in a playground: pick "Required semantics", then switch Default,
// Bootstrap and Material UI while the same schema renders.
import type { TexarynExample } from '../types.js'

export const requiredSemantics: TexarynExample = {
  id: 'accessibility-required',
  title: 'Required semantics',
  description:
    'A required field beside an optional one. Texaryn marks required fields for assistive technology without setting the native required attribute, so the browser does not run its own validation ahead of the runtime.',
  category: 'accessibility',
  covers: ['accessibility.required', 'schema.field.required', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Required semantics',
    properties: {
      name: { type: 'string', title: 'Name' },
      nickname: { type: 'string', title: 'Nickname' },
    },
    required: ['name'],
  },
  initialData: { name: '', nickname: '' },
}

export const descriptionAssociation: TexarynExample = {
  id: 'accessibility-description',
  startsInvalid: true,
  title: 'Description association',
  description:
    'A field carrying a description. Every renderer associates it with the control rather than leaving it as loose text nearby, and any element it points at has to exist.',
  category: 'accessibility',
  covers: ['accessibility.description', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Description association',
    properties: {
      password: {
        type: 'string',
        title: 'Password',
        description: 'At least twelve characters.',
        minLength: 12,
      },
    },
  },
  initialData: { password: '' },
}

export const errorAssociation: TexarynExample = {
  id: 'accessibility-error-association',
  startsInvalid: true,
  title: 'Error association',
  description:
    'A field that fails validation once touched. The error has to reach assistive technology as part of the field rather than only appearing visually, and the field has to stop being announced as invalid once it is valid again.',
  category: 'accessibility',
  covers: [
    'accessibility.error-association',
    'validation.trigger.blur',
    'schema.constraint.minLength',
  ],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Error association',
    properties: {
      username: {
        type: 'string',
        title: 'Username',
        description: 'Shown until an error needs the space.',
        minLength: 3,
      },
    },
    required: ['username'],
  },
  hints: {
    '/username': { validationTrigger: 'blur' },
  },
  initialData: { username: '' },
}

export const accessibilityExamples = [
  requiredSemantics,
  descriptionAssociation,
  errorAssociation,
] as const
