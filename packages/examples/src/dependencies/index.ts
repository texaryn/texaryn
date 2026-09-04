import type { TexarynExample } from '../types.js'

export const dependentSchemas: TexarynExample = {
  id: 'dependency-dependent-schemas',
  title: 'dependentSchemas',
  description:
    'Filling in the credit card number activates the CVV field. Clearing it deactivates CVV again, so the dependent subschema applies only while its trigger property is present.',
  category: 'dependencies',
  covers: ['schema.dependency.dependentSchemas', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Payment',
    properties: {
      creditCard: { type: 'string', title: 'Credit card' },
    },
    dependentSchemas: {
      creditCard: {
        properties: {
          cvv: { type: 'string', title: 'CVV', minLength: 3, maxLength: 4 },
        },
        required: ['cvv'],
      },
    },
  },
  initialData: { creditCard: '4111111111111111', cvv: '123' },
}

export const dependentRequired: TexarynExample = {
  id: 'dependency-dependent-required',
  title: 'dependentRequired',
  description:
    'Presence of one property makes another required without changing the shape of the form. The billing address becomes required only once a credit card is given.',
  category: 'dependencies',
  covers: ['schema.dependency.dependentRequired', 'schema.type.string'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Billing',
    properties: {
      creditCard: { type: 'string', title: 'Credit card' },
      billingAddress: { type: 'string', title: 'Billing address' },
    },
    dependentRequired: {
      creditCard: ['billingAddress'],
    },
  },
  initialData: { creditCard: '4111111111111111', billingAddress: '1 Example Street' },
}

export const draft07Dependencies: TexarynExample = {
  id: 'dependency-draft07',
  title: 'Draft 7 dependencies',
  description:
    'Draft 7 folds both behaviours into a single dependencies keyword. Texaryn supports it for draft-07 schemas, where dependentSchemas and dependentRequired do not exist.',
  category: 'dependencies',
  dialect: 'draft-07',
  covers: [
    'schema.dependency.draft07-dependencies',
    'schema.dialect.draft-07',
    'schema.type.string',
  ],
  schema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'Payment (draft 7)',
    properties: {
      creditCard: { type: 'string', title: 'Credit card' },
    },
    dependencies: {
      creditCard: {
        properties: {
          cvv: { type: 'string', title: 'CVV', minLength: 3, maxLength: 4 },
        },
        required: ['cvv'],
      },
    },
  },
  initialData: { creditCard: '4111111111111111', cvv: '123' },
}

export const dependencyExamples = [
  dependentSchemas,
  dependentRequired,
  draft07Dependencies,
] as const
