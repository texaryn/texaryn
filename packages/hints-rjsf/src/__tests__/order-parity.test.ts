import { describe, it, expect } from 'vitest'
import { orderProperties } from '@rjsf/utils'
import { createFormRuntime } from '@texaryn/core'
import type { ContainerNode } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { fromUiSchema } from '../index.js'

const string = { type: 'string' }
const own = { type: 'object', properties: { a: string, b: string, c: string, d: string } }
const withAllOf = { type: 'object', properties: { a: string, b: string }, allOf: [{ properties: { c: string, d: string } }] }

async function rendered(schema: object, order: string[]): Promise<string[]> {
  const port = await createJsonSchemaAdapter(schema)
  const { hints } = fromUiSchema({ 'ui:order': order }, port.project({}))
  const runtime = createFormRuntime(port, { initialData: {}, hints })
  const document = runtime.document.getSnapshot()
  const root = document.nodes[document.rootId] as ContainerNode
  return root.children.map((id) => String(document.nodes[id]?.dataPointer).slice(1))
}

const orders = [['*'], ['c', '*'], ['*', 'a'], ['d', '*', 'b', 'a'], ['b', 'a', 'd', 'c'], ['c', 'x', '*']].map((order) => [order])

describe.each([
  ['own properties', own],
  ['own and allOf properties', withAllOf],
])('ui:order over %s', (_name, schema) => {
  it.each(orders)('matches orderProperties for %j', async (order) => {
    expect(await rendered(schema, order)).toEqual(orderProperties(['a', 'b', 'c', 'd'], order))
  })
})

describe('an order RJSF refuses', () => {
  it('writes no order hint, so schema order stands', async () => {
    for (const order of [['a', 'b'], ['*', 'a', '*']]) {
      expect(() => orderProperties(['a', 'b', 'c', 'd'], order)).toThrow()
      expect(await rendered(own, order)).toEqual(['a', 'b', 'c', 'd'])
    }
  })
})
