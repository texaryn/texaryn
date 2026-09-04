import { describe, it, expect } from 'vitest'
import { compile } from '../compiler.js'
import type { SchemaProjection, NodeProjection } from '../../schema/port.js'
import type { JsonPointer } from '../../types.js'

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

      const { identityMap } = compile(projection, { items: ['a', 'b'] })
      // Identity map keys by NodeId (the array container's id), not pointer.
      // Verify that the map has an entry for the items array container.
      expect(identityMap.arrayIdentities.size).toBe(1)
      const [, itemIds] = [...identityMap.arrayIdentities.entries()][0]
      expect(itemIds.length).toBe(2)
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
