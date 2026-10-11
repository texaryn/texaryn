// One representative example per supported dialect. These exist to prove the
// dialect is detected and honoured, not to duplicate every other example
// four times: the dialects only need their own example where the semantics
// actually differ.
import type { TexarynExample } from '../types.js'

export const draft04: TexarynExample = {
  id: 'dialect-draft-04',
  title: 'Draft 4',
  description: 'A Draft 4 schema with legacy identifiers and exclusive bounds.',
  category: 'dialects',
  dialect: 'draft-04',
  covers: ['schema.dialect.draft-04', 'schema.type.string', 'schema.type.number', 'schema.reference.local-ref'],
  schema: {
    $schema: 'http://json-schema.org/draft-04/schema#',
    id: 'https://example.com/schemas/draft-04-profile.json',
    type: 'object',
    title: 'Draft 4 form',
    definitions: {
      displayName: { type: 'string', minLength: 2 },
    },
    properties: {
      name: { $ref: '#/definitions/displayName', title: 'Name' },
      score: { type: 'number', minimum: 0, exclusiveMinimum: true, title: 'Score' },
    },
  },
  initialData: { name: 'Ada', score: 9.5 },
}

export const draft07: TexarynExample = {
  id: 'dialect-draft-07',
  title: 'Draft 7',
  description: 'A draft-07 schema, detected from its $schema keyword.',
  category: 'dialects',
  dialect: 'draft-07',
  covers: ['schema.dialect.draft-07', 'schema.type.string', 'schema.type.integer'],
  schema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'Draft 7 form',
    properties: {
      name: { type: 'string', title: 'Name' },
      age: { type: 'integer', title: 'Age', minimum: 0 },
    },
    required: ['name'],
  },
  initialData: { name: 'Ada', age: 36 },
}

export const draft201909: TexarynExample = {
  id: 'dialect-2019-09',
  title: '2019-09',
  description: 'A 2019-09 schema, the first dialect with dependentSchemas and $defs.',
  category: 'dialects',
  dialect: '2019-09',
  covers: ['schema.dialect.2019-09', 'schema.type.string', 'schema.type.boolean'],
  schema: {
    $schema: 'https://json-schema.org/draft/2019-09/schema',
    type: 'object',
    title: '2019-09 form',
    properties: {
      email: { type: 'string', title: 'Email', format: 'email' },
      verified: { type: 'boolean', title: 'Verified' },
    },
  },
  initialData: { email: 'ada@example.com', verified: true },
}

export const draft202012: TexarynExample = {
  id: 'dialect-2020-12',
  title: '2020-12',
  description: 'A 2020-12 schema, the default dialect for the rest of the catalog.',
  category: 'dialects',
  dialect: '2020-12',
  covers: ['schema.dialect.2020-12', 'schema.type.string', 'schema.type.array'],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: '2020-12 form',
    properties: {
      title: { type: 'string', title: 'Title' },
      tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' } },
    },
  },
  initialData: { title: 'Texaryn', tags: ['forms'] },
}

export const dialectExamples = [draft04, draft07, draft201909, draft202012] as const
