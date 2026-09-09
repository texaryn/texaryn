import { describe, it } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'

// Throwaway: narrowing down why every Backstage step produces no root node.
describe('why the projection has no root', () => {
  const cases: Array<[string, unknown]> = [
    ['properties only, as Backstage writes it', { properties: { a: { type: 'string' } } }],
    ['with an explicit type', { type: 'object', properties: { a: { type: 'string' } } }],
    ['title plus properties', { title: 'S', properties: { a: { type: 'string' } } }],
    ['required plus properties', { required: ['a'], properties: { a: { type: 'string' } } }],
    ['a leaf property with no type', { type: 'object', properties: { a: {} } }],
    ['a leaf property typed only by enum', { type: 'object', properties: { a: { enum: ['x'] } } }],
    [
      'a nested object with no type',
      { type: 'object', properties: { a: { properties: { b: { type: 'string' } } } } },
    ],
    [
      'an array whose items have no type',
      { type: 'object', properties: { a: { type: 'array', items: {} } } },
    ],
  ]

  it.each(cases)('%s', async (_name, schema) => {
    const port = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
    const projection = port.project(undefined)
    const pointers = [...projection.nodes.keys()]
    console.log(`  node pointers: ${JSON.stringify(pointers)}`)
    const root = projection.nodes.get('' as never)
    console.log(`  root type: ${root ? root.type : 'MISSING'}`)
  })
})
