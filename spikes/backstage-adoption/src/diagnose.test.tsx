import { describe, it } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'

/**
 * Throwaway probe: testing the theory that the crash happens exactly when the
 * `oneOf` inside `dependencies` matches a number of branches other than one,
 * because upstream then has no node to return and the projection walk
 * dereferences it anyway.
 */
const oneOfInDependencies = (branches: unknown[]) => ({
  type: 'object',
  properties: { flag: { type: 'boolean' } },
  dependencies: { flag: { oneOf: branches } },
})

const cases: Array<[string, unknown, unknown]> = [
  [
    'exactly one branch matches',
    oneOfInDependencies([
      { properties: { flag: { const: false } } },
      { properties: { flag: { const: true } } },
    ]),
    { flag: true },
  ],
  [
    'both branches match',
    oneOfInDependencies([{ properties: { a: {} } }, { properties: { b: {} } }]),
    { flag: true },
  ],
  [
    'no branch matches: the branch for this value fails its own required',
    oneOfInDependencies([
      { properties: { flag: { const: false } } },
      { properties: { flag: { const: true } }, required: ['extra'] },
    ]),
    { flag: true },
  ],
  [
    'no branch matches, and the data satisfies the required',
    oneOfInDependencies([
      { properties: { flag: { const: false } } },
      { properties: { flag: { const: true } }, required: ['extra'] },
    ]),
    { flag: true, extra: 'x' },
  ],
]

describe('when exactly does the projection crash', () => {
  it.each(cases)('%s', async (_label, schema, data) => {
    const port = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
    const verdict = await port.validate(data)
    let projected: string
    try {
      projected = JSON.stringify([...port.project(data).nodes.keys()])
    } catch (error) {
      projected = `THREW ${(error as Error).constructor.name}`
    }
    console.log(`  data=${JSON.stringify(data)} valid=${verdict.valid} project -> ${projected}`)
  })
})
