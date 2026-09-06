import { describe, it, expect } from 'vitest'
import { compile } from '../compiler.js'
import type { CompileResult } from '../compiler-types.js'
import type { ContainerNode } from '../types.js'
import type { SchemaProjection, NodeProjection } from '../../schema/port.js'
import type { JsonPointer } from '../../types.js'
import { identityKey } from '../../identity/key.js'

function makeProjection(
  entries: Array<[string, Partial<NodeProjection> & { type: NodeProjection['type'] }]>,
): SchemaProjection {
  const nodes = new Map<JsonPointer, NodeProjection>()
  for (const [ptr, partial] of entries) {
    nodes.set(ptr as JsonPointer, {
      type: partial.type,
      format: partial.format,
      constraints: partial.constraints ?? {},
      children: partial.children,
      enumValues: partial.enumValues,
      active: partial.active ?? true,
      annotations: partial.annotations ?? {},
    })
  }
  return { nodes }
}

describe('compile', () => {
  describe('primitive fields', () => {
    it('compiles a flat object with string and integer fields', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/name' as JsonPointer, key: 'name', required: true },
            { pointer: '/age' as JsonPointer, key: 'age', required: false },
          ],
        }],
        ['/name', {
          type: 'string',
          annotations: { title: 'Name' },
          constraints: { minLength: 1 },
        }],
        ['/age', {
          type: 'integer',
          annotations: { title: 'Age' },
          constraints: { minimum: 0 },
        }],
      ])

      const { document } = compile(projection, {})
      expect(document.version).toBe(1)

      const root = document.nodes[document.rootId]
      expect(root.type).toBe('container')

      const nameNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/name',
      )!
      expect(nameNode.type).toBe('field')
      expect((nameNode as any).fieldType).toBe('string')
      expect((nameNode as any).constraints.minLength).toBe(1)
      expect(nameNode.annotations.title).toBe('Name')
    })

    it('assigns unique NodeIds', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/a' as JsonPointer, key: 'a', required: false },
            { pointer: '/b' as JsonPointer, key: 'b', required: false },
          ],
        }],
        ['/a', { type: 'string' }],
        ['/b', { type: 'number' }],
      ])

      const { document } = compile(projection, {})
      const ids = Object.keys(document.nodes)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('sets parentId correctly', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/x' as JsonPointer, key: 'x', required: false },
          ],
        }],
        ['/x', { type: 'string' }],
      ])

      const { document } = compile(projection, {})
      const root = document.nodes[document.rootId]
      expect(root.parentId).toBeNull()

      const xNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/x',
      )!
      expect(xNode.parentId).toBe(document.rootId)
    })

    it('maps boolean type', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/flag' as JsonPointer, key: 'flag', required: false },
          ],
        }],
        ['/flag', { type: 'boolean', annotations: { default: false } }],
      ])

      const { document } = compile(projection, {})
      const flagNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/flag',
      )! as any
      expect(flagNode.fieldType).toBe('boolean')
    })

    it('maps format to FieldNode', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/email' as JsonPointer, key: 'email', required: false },
          ],
        }],
        ['/email', { type: 'string', format: 'email' }],
      ])

      const { document } = compile(projection, {})
      const emailNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/email',
      )! as any
      expect(emailNode.format).toBe('email')
    })

    it('maps enum values', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/color' as JsonPointer, key: 'color', required: false },
          ],
        }],
        ['/color', {
          type: 'string',
          enumValues: [
            { value: 'red' },
            { value: 'green' },
          ],
        }],
      ])

      const { document } = compile(projection, {})
      const colorNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/color',
      )! as any
      expect(colorNode.enumValues).toEqual([
        { value: 'red' },
        { value: 'green' },
      ])
    })
  })

  describe('nested objects', () => {
    it('compiles nested object as container with children', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/addr' as JsonPointer, key: 'addr', required: false },
          ],
        }],
        ['/addr', {
          type: 'object',
          annotations: { title: 'Address' },
          children: [
            { pointer: '/addr/street' as JsonPointer, key: 'street', required: true },
            { pointer: '/addr/city' as JsonPointer, key: 'city', required: false },
          ],
        }],
        ['/addr/street', { type: 'string', annotations: { title: 'Street' } }],
        ['/addr/city', { type: 'string', annotations: { title: 'City' } }],
      ])

      const { document } = compile(projection, {})
      const addrNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/addr',
      )! as any
      expect(addrNode.type).toBe('container')
      expect(addrNode.containerType).toBe('object')
      expect(addrNode.children.length).toBe(2)
    })
  })

  describe('arrays', () => {
    it('compiles array as container with arrayMeta', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/tags' as JsonPointer, key: 'tags', required: false },
          ],
        }],
        ['/tags', {
          type: 'array',
          annotations: { title: 'Tags' },
          constraints: { minItems: 1, maxItems: 5 },
        }],
      ])

      const { document } = compile(projection, { tags: ['a', 'b'] })
      const tagsNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/tags',
      )! as any
      expect(tagsNode.type).toBe('container')
      expect(tagsNode.containerType).toBe('array')
      expect(tagsNode.arrayMeta).toBeDefined()
      expect(tagsNode.arrayMeta.minItems).toBe(1)
      expect(tagsNode.arrayMeta.maxItems).toBe(5)
      expect(tagsNode.arrayMeta.canAdd).toBe(true)
      expect(tagsNode.arrayMeta.canRemove).toBe(true)
    })

    it('compiles array items with identity map', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/items' as JsonPointer, key: 'items', required: false },
          ],
        }],
        ['/items', {
          type: 'array',
          constraints: {},
        }],
        ['/items/0', { type: 'string' }],
        ['/items/1', { type: 'string' }],
      ])

      const result = compile(projection, { items: ['a', 'b'] })
      const { identityMap } = result
      expect(identityMap.arrayIdentities.size).toBe(1)
      const [key, itemIds] = [...identityMap.arrayIdentities.entries()][0]
      expect(itemIds.length).toBe(2)
      expect(arrayNodes(result)[0].arrayMeta!.identityKey).toBe(key)
    })

    it('sets canAdd false when at maxItems', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/list' as JsonPointer, key: 'list', required: false },
          ],
        }],
        ['/list', {
          type: 'array',
          constraints: { maxItems: 2 },
        }],
        ['/list/0', { type: 'string' }],
        ['/list/1', { type: 'string' }],
      ])

      const { document } = compile(projection, { list: ['a', 'b'] })
      const listNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/list',
      )! as any
      expect(listNode.arrayMeta.canAdd).toBe(false)
    })
  })

  describe('UI hints', () => {
    it('applies widget hint to field', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/bio' as JsonPointer, key: 'bio', required: false },
          ],
        }],
        ['/bio', { type: 'string' }],
      ])

      const { document } = compile(projection, {}, {
        '/bio': { widget: 'textarea' },
      })
      const bioNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/bio',
      )! as any
      expect(bioNode.widget).toBe('textarea')
    })

    it('applies placeholder hint to field and leaves it undefined otherwise', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/email' as JsonPointer, key: 'email', required: false },
            { pointer: '/name' as JsonPointer, key: 'name', required: false },
          ],
        }],
        ['/email', { type: 'string' }],
        ['/name', { type: 'string' }],
      ])

      const { document } = compile(projection, {}, {
        '/email': { placeholder: 'you@example.com' },
      })
      const byPointer = (pointer: string) =>
        Object.values(document.nodes).find(n => n.dataPointer === pointer)! as any
      expect(byPointer('/email').placeholder).toBe('you@example.com')
      expect(byPointer('/name').placeholder).toBeUndefined()
    })

    it('applies helpText hint to field', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/bio' as JsonPointer, key: 'bio', required: false },
          ],
        }],
        ['/bio', { type: 'string' }],
      ])

      const { document } = compile(projection, {}, {
        '/bio': { helpText: 'Tell us about yourself.' },
      })
      const bioNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/bio',
      )! as any
      expect(bioNode.helpText).toBe('Tell us about yourself.')
    })
  })

  describe('conditional visibility', () => {
    it('sets visible: false for inactive nodes', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/name' as JsonPointer, key: 'name', required: true },
            { pointer: '/hidden' as JsonPointer, key: 'hidden', required: false },
          ],
        }],
        ['/name', { type: 'string', active: true }],
        ['/hidden', { type: 'string', active: false }],
      ])

      const { document } = compile(projection, {})
      const hiddenNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/hidden',
      )!
      expect(hiddenNode.visible).toBe(false)
    })

    it('sets visible: true for active nodes', () => {
      const projection = makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: '/shown' as JsonPointer, key: 'shown', required: false },
          ],
        }],
        ['/shown', { type: 'string', active: true }],
      ])

      const { document } = compile(projection, {})
      const shownNode = Object.values(document.nodes).find(
        n => n.dataPointer === '/shown',
      )!
      expect(shownNode.visible).toBe(true)
    })
  })
})

function nestedProjection(rows: Array<{ tags: string[] }>): SchemaProjection {
  const nodes = new Map<JsonPointer, NodeProjection>()
  const node = (p: string, n: Partial<NodeProjection> & { type: NodeProjection['type'] }): void => {
    nodes.set(p as JsonPointer, {
      type: n.type,
      constraints: n.constraints ?? {},
      children: n.children,
      active: n.active ?? true,
      annotations: n.annotations ?? {},
    })
  }
  node('', {
    type: 'object',
    children: [{ pointer: '/rows' as JsonPointer, key: 'rows', required: false }],
  })
  node('/rows', { type: 'array' })
  rows.forEach((row, i) => {
    node(`/rows/${i}`, {
      type: 'object',
      children: [{ pointer: `/rows/${i}/tags` as JsonPointer, key: 'tags', required: false }],
    })
    node(`/rows/${i}/tags`, { type: 'array' })
    row.tags.forEach((_, j) => node(`/rows/${i}/tags/${j}`, { type: 'string' }))
  })
  return { nodes }
}

function arrayNodes(result: CompileResult): ContainerNode[] {
  return Object.values(result.document.nodes).filter(
    (n): n is ContainerNode => n.type === 'container' && n.containerType === 'array',
  )
}

describe('identity keys', () => {
  it('stamps every array with a segment key built from property names and item ids', () => {
    const data = { rows: [{ tags: ['a'] }] }
    const result = compile(nestedProjection(data.rows), data)
    const outer = arrayNodes(result).find((n) => n.dataPointer === '/rows')!
    const inner = arrayNodes(result).find((n) => n.dataPointer === '/rows/0/tags')!
    expect(outer.arrayMeta!.identityKey).toBe(identityKey([{ kind: 'property', name: 'rows' }]))
    expect(inner.arrayMeta!.identityKey).toBe(
      identityKey([
        { kind: 'property', name: 'rows' },
        { kind: 'item', id: outer.arrayMeta!.itemIds[0] },
        { kind: 'property', name: 'tags' },
      ]),
    )
    expect(result.identityMap.arrayIdentities.has(inner.arrayMeta!.identityKey)).toBe(true)
  })

  it('drops arrays that were not visited in this compile', () => {
    const two = { rows: [{ tags: ['a'] }, { tags: ['b'] }] }
    const first = compile(nestedProjection(two.rows), two)
    expect(first.identityMap.arrayIdentities.size).toBe(3)
    const one = { rows: [{ tags: ['a'] }] }
    const shrunk = compile(nestedProjection(one.rows), one, undefined, first.identityMap)
    expect(shrunk.identityMap.arrayIdentities.size).toBe(2)
    for (const entry of shrunk.identityMap.itemLookup.values()) {
      expect(shrunk.identityMap.arrayIdentities.has(entry.containerKey)).toBe(true)
    }
  })

  it('leaves the input map untouched when compilation throws', () => {
    const data = { rows: [{ tags: ['a'] }] }
    const first = compile(nestedProjection(data.rows), data)
    const before = JSON.stringify([...first.identityMap.arrayIdentities])
    const source = nestedProjection(data.rows).nodes
    class Throwing extends Map<JsonPointer, NodeProjection> {
      override get(k: JsonPointer): NodeProjection | undefined {
        if (k === '/rows/0/tags') throw new Error('boom')
        return source.get(k)
      }
    }
    const throwing: SchemaProjection = { nodes: new Throwing(source) }
    expect(() => compile(throwing, data, undefined, first.identityMap)).toThrow('boom')
    expect(JSON.stringify([...first.identityMap.arrayIdentities])).toBe(before)
  })
})
