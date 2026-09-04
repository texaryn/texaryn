import type { TexarynExample } from '../types.js'

// The discriminator value in initialData decides which branch is active.
// Change `accountType` and the projection flips which fields are active,
// which is the behaviour worth watching in the playground.
export const ifThenElse: TexarynExample = {
  id: 'conditional-if-then-else',
  title: 'if / then / else',
  description:
    'Set the account type to business and the company fields activate; set it to personal and the nickname activates instead. Fields from the inactive branch stay in the document with active false rather than disappearing.',
  category: 'composition',
  covers: ['schema.conditional.if-then-else', 'schema.enum.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Account',
    properties: {
      accountType: {
        type: 'string',
        title: 'Account type',
        enum: ['personal', 'business'],
      },
    },
    required: ['accountType'],
    if: {
      properties: { accountType: { const: 'business' } },
      required: ['accountType'],
    },
    then: {
      properties: {
        companyName: { type: 'string', title: 'Company name' },
        taxId: { type: 'string', title: 'Tax ID' },
      },
    },
    else: {
      properties: {
        nickname: { type: 'string', title: 'Nickname' },
      },
    },
  },
  initialData: { accountType: 'business' },
}

export const conditionalExamples = [ifThenElse] as const
