import type { TexarynExample } from '../types.js'

/**
 * JSON Schema calls these annotations rather than assertions, and expects
 * applications to make their own use of them. The claim this example proves is
 * that each one reaches the compiled node, which is exactly what the support
 * guide promises: metadata is passed through without guaranteeing a control.
 * The Projection and IR inspectors in the playground are where they are seen.
 *
 * `default` is the one worth being careful about. It is projected and never
 * applied: JSON Schema is explicit that it does not fill a missing instance
 * value, and the semantic test asserts both halves so nobody later mistakes it
 * for initialization.
 */
export const fieldAnnotations: TexarynExample = {
  id: 'basics-annotations',
  title: 'Field annotations',
  description:
    'Every annotation the projection carries, on one field each. They reach the runtime and widgets; none of them guarantees a dedicated control, and default is not applied to the data.',
  category: 'basics',
  covers: [
    'schema.annotation.title',
    'schema.annotation.description',
    'schema.annotation.default',
    'schema.annotation.examples',
    'schema.annotation.readOnly',
    'schema.annotation.writeOnly',
    'schema.annotation.format',
    'schema.annotation.deprecated',
    'schema.type.object',
    'schema.type.string',
  ],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Account',
    description: 'One field per annotation the projection carries.',
    properties: {
      nickname: {
        type: 'string',
        title: 'Nickname',
        description: 'What other people see.',
        default: 'Ada',
        examples: ['Ada', 'Grace'],
      },
      email: { type: 'string', title: 'Email', format: 'email' },
      accountId: { type: 'string', title: 'Account id', readOnly: true },
      newPassword: { type: 'string', title: 'New password', writeOnly: true },
      faxNumber: { type: 'string', title: 'Fax number', deprecated: true },
    },
  },
  // nickname is deliberately absent: default is projected, not applied.
  initialData: { email: 'ada@example.com', accountId: 'acct_1', newPassword: '', faxNumber: '' },
}

export const annotationExamples = [fieldAnnotations] as const
