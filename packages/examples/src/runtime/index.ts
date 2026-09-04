import type { TexarynExample } from '../types.js'

export const validationTriggers: TexarynExample = {
  id: 'runtime-validation-triggers',
  startsInvalid: true,
  title: 'Validation triggers',
  description:
    'Three fields, each validated at a different moment. Change validates as you type, blur waits until you leave the field, and submit holds everything until the form is submitted.',
  category: 'validation',
  covers: [
    'validation.trigger.change',
    'validation.trigger.blur',
    'validation.trigger.submit',
    'schema.constraint.minLength',
  ],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Triggers',
    properties: {
      onChange: { type: 'string', title: 'Validated on change', minLength: 3 },
      onBlur: { type: 'string', title: 'Validated on blur', minLength: 3 },
      onSubmit: { type: 'string', title: 'Validated on submit', minLength: 3 },
    },
  },
  hints: {
    '/onChange': { validationTrigger: 'change' },
    '/onBlur': { validationTrigger: 'blur' },
    '/onSubmit': { validationTrigger: 'submit' },
  },
  initialData: { onChange: '', onBlur: '', onSubmit: '' },
}

export const arrayInteractions: TexarynExample = {
  id: 'runtime-array-interactions',
  title: 'Array add, remove and identity',
  description:
    'Add and remove rows and watch the identity of the surviving rows. Removing the first item must not hand its identity to the second, which is what keeps focus and per-item state attached to the right row.',
  category: 'arrays',
  covers: [
    'runtime.array.add',
    'runtime.array.remove',
    'runtime.array.stable-identity',
    'schema.type.array',
  ],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Shopping list',
    properties: {
      items: {
        type: 'array',
        title: 'Items',
        items: { type: 'string', title: 'Item' },
      },
    },
  },
  initialData: { items: ['milk', 'bread'] },
}

export const numericCoercion: TexarynExample = {
  id: 'runtime-numeric-coercion',
  title: 'Numeric coercion',
  description:
    'Controls hand back strings. The binding coerces them to numbers for numeric fields, so form data holds a number regardless of which control produced it, and clearing a field yields undefined rather than an empty string.',
  category: 'basics',
  covers: ['runtime.binding.numeric-coercion', 'schema.type.number', 'schema.type.integer'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Numbers',
    properties: {
      count: { type: 'integer', title: 'Count' },
      ratio: { type: 'number', title: 'Ratio' },
    },
  },
  initialData: { count: 1, ratio: 0.5 },
}

export const enumValuePreservation: TexarynExample = {
  id: 'runtime-enum-preservation',
  title: 'Enum value preservation',
  description:
    'A numeric enum. Selecting an option stores the original typed value rather than the string a select element produced, so the data still matches the schema.',
  category: 'basics',
  covers: ['runtime.binding.enum-value-preservation', 'schema.type.integer'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Priority',
    properties: {
      level: { type: 'integer', title: 'Level', enum: [1, 2, 3] },
    },
  },
  initialData: { level: 2 },
}

export const submissionLifecycle: TexarynExample = {
  id: 'runtime-submission',
  startsInvalid: true,
  title: 'Submission lifecycle',
  description:
    'Submitting validates first and only proceeds when the form is valid. A required field left empty blocks submission and surfaces the error instead.',
  category: 'validation',
  covers: ['runtime.submission.lifecycle', 'schema.field.required'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Submit',
    properties: {
      email: { type: 'string', title: 'Email', minLength: 3 },
    },
    required: ['email'],
  },
  initialData: { email: '' },
}

export const runtimeExamples = [
  validationTriggers,
  arrayInteractions,
  numericCoercion,
  enumValuePreservation,
  submissionLifecycle,
] as const
