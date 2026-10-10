import { describe, expect, it } from 'vitest'
import type { JsonPointer } from '@texaryn/core'
import { createAdapter } from '../adapter.js'
import { createJsonSchemaAdapter } from '../index.js'

const toPointer = (pointer: string) => pointer as JsonPointer

const on2020 = (schema: Record<string, unknown>) => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...schema,
})

const on2019 = (schema: Record<string, unknown>) => ({
  $schema: 'https://json-schema.org/draft/2019-09/schema',
  ...schema,
})

const adapterFor = (schema: Record<string, unknown>) =>
  createJsonSchemaAdapter(schema, { dynamicReferenceProjection: 'local' })

const childKeys = (projection: Awaited<ReturnType<Awaited<ReturnType<typeof adapterFor>>['project']>>, pointer: string) =>
  projection.nodes.get(toPointer(pointer))?.children?.map(({ key }) => key)

describe('local dynamic reference projection', () => {
  it('keeps missing-value branch defaults local to each dynamic scope', async () => {
    const firstUri = 'https://example.test/first.json'
    const secondUri = 'https://example.test/second.json'
    const sharedUri = 'https://example.test/shared.json'
    const baseUri = 'https://example.test/base.json'
    const adapter = await createJsonSchemaAdapter(on2020({
      $id: 'https://example.test/root.json',
      type: 'object',
      properties: {
        first: { $ref: firstUri },
        second: { $ref: secondUri },
      },
    }), {
      dynamicReferenceProjection: 'local',
      resolveResource: (uri) => uri === firstUri
        ? {
            $id: firstUri,
            $ref: sharedUri,
            $defs: { gate: { $dynamicAnchor: 'gate', const: null } },
          }
        : uri === secondUri
          ? {
              $id: secondUri,
              $ref: sharedUri,
              $defs: { gate: { $dynamicAnchor: 'gate' } },
            }
          : uri === sharedUri
            ? {
                $id: sharedUri,
                type: 'object',
                properties: {
                  pending: {
                    type: 'string',
                    if: { $dynamicRef: `${baseUri}#gate` },
                    then: { default: 'yes' },
                    else: { default: 'no' },
                  },
                },
              }
            : uri === baseUri
              ? { $id: baseUri, $dynamicAnchor: 'gate', const: 'base' }
              : undefined,
    })

    const projection = adapter.project({})

    expect(projection.nodes.get(toPointer('/first/pending'))?.annotations.default).toBe('no')
    expect(projection.nodes.get(toPointer('/second/pending'))?.annotations.default).toBe('yes')
  })

  it('rebinds a recursive reference to the matching outer anchor', async () => {
    const adapter = await adapterFor(on2020({
      $dynamicAnchor: 'node',
      type: 'object',
      properties: {
        rootValue: { type: 'string' },
        nested: { $ref: '#/$defs/base' },
      },
      $defs: {
        base: {
          $id: 'https://example.test/base',
          $dynamicAnchor: 'node',
          type: 'object',
          properties: {
            baseValue: { type: 'string' },
            next: { $dynamicRef: '#node' },
          },
        },
      },
    }))

    const projection = adapter.project({ nested: { next: {} } })

    expect(childKeys(projection, '/nested/next')).toEqual(['rootValue', 'nested'])
    expect(projection.nodes.has(toPointer('/nested/next/rootValue'))).toBe(true)
    expect(projection.nodes.get(toPointer('/nested/next/nested'))?.boundaries).toEqual(['recursion'])
  })

  it('does not let an unrelated outer anchor capture a dynamic reference', async () => {
    const adapter = await adapterFor(on2020({
      $dynamicAnchor: 'outer',
      type: 'object',
      properties: {
        outerValue: { type: 'string' },
        nested: { $ref: '#/$defs/base' },
      },
      $defs: {
        base: {
          $id: 'https://example.test/base',
          $dynamicAnchor: 'node',
          type: 'object',
          properties: {
            baseValue: { type: 'string' },
            next: { $dynamicRef: '#node' },
          },
        },
      },
    }))

    const projection = adapter.project({ nested: { next: {} } })

    expect(childKeys(projection, '/nested/next')).toEqual(['baseValue', 'next'])
    expect(projection.nodes.has(toPointer('/nested/next/outerValue'))).toBe(false)
  })

  it('keeps pointer dynamic references static when an unrelated anchor is in scope', async () => {
    const adapter = await adapterFor(on2020({
      $dynamicAnchor: 'outer',
      type: 'object',
      properties: {
        next: { $dynamicRef: '#/$defs/base' },
        outerValue: { type: 'string' },
      },
      $defs: {
        base: {
          type: 'object',
          required: ['baseValue'],
          properties: { baseValue: { type: 'string' } },
        },
      },
    }))

    const projection = adapter.project({ next: {} })

    expect(childKeys(projection, '/next')).toEqual(['baseValue'])
    expect(projection.nodes.has(toPointer('/next/outerValue'))).toBe(false)
    expect((await adapter.validate({ next: {} })).valid).toBe(false)
  })

  it('finds a matching anchor in each active local resource', async () => {
    const adapter = await adapterFor(on2020({
      $id: 'https://example.test/root',
      type: 'object',
      properties: { child: { $ref: 'base' } },
      $defs: {
        override: {
          $dynamicAnchor: 'node',
          type: 'object',
          properties: { outerValue: { type: 'string' } },
        },
        base: {
          $id: 'base',
          $dynamicAnchor: 'node',
          type: 'object',
          properties: {
            baseValue: { type: 'string' },
            next: { $dynamicRef: '#node' },
          },
        },
      },
    }))

    const projection = adapter.project({ child: { next: {} } })

    expect(childKeys(projection, '/child/next')).toEqual(['outerValue'])
    expect(projection.nodes.has(toPointer('/child/next/baseValue'))).toBe(false)
  })

  it('adds an id only child resource to dynamic scope', async () => {
    const adapter = await adapterFor(on2020({
      $id: 'https://example.test/root',
      type: 'object',
      properties: {
        child: {
          $id: 'https://example.test/child',
          type: 'object',
          properties: { nested: { $ref: 'https://example.test/base' } },
          $defs: {
            override: {
              $dynamicAnchor: 'node',
              type: 'object',
              properties: { childValue: { type: 'string' } },
            },
          },
        },
      },
      $defs: {
        base: {
          $id: 'https://example.test/base',
          $dynamicAnchor: 'node',
          type: 'object',
          properties: {
            baseValue: { type: 'string' },
            next: { $dynamicRef: '#node' },
          },
        },
      },
    }))

    const projection = adapter.project({ child: { nested: { next: {} } } })

    expect(childKeys(projection, '/child/nested/next')).toEqual(['childValue'])
    expect(projection.nodes.has(toPointer('/child/nested/next/baseValue'))).toBe(false)
  })

  it('isolates dynamic scope between sibling resources in either property order', async () => {
    const first = {
      $id: 'https://example.test/first',
      $dynamicAnchor: 'node',
      type: 'object',
      properties: {
        firstValue: { type: 'string' },
        next: { $dynamicRef: '#node' },
      },
    }
    const second = {
      $id: 'https://example.test/second',
      $dynamicAnchor: 'node',
      type: 'object',
      properties: {
        secondValue: { type: 'integer' },
        next: { $dynamicRef: '#node' },
      },
    }

    for (const properties of [
      { first, second },
      { second, first },
    ]) {
      const adapter = await adapterFor(on2020({
        $id: 'https://example.test/root',
        type: 'object',
        properties,
      }))
      const projection = adapter.project({ first: { next: {} }, second: { next: {} } })

      expect(childKeys(projection, '/first/next')).toEqual(['firstValue', 'next'])
      expect(childKeys(projection, '/second/next')).toEqual(['secondValue', 'next'])
    }
  })

  it('retains the reachable shape of an absent dynamic reference up to the recursion boundary', async () => {
    const adapter = await adapterFor(on2020({
      $dynamicAnchor: 'node',
      type: 'object',
      properties: {
        rootValue: { type: 'string' },
        nested: { $ref: '#/$defs/base' },
      },
      $defs: {
        base: {
          $id: 'https://example.test/base',
          $dynamicAnchor: 'node',
          type: 'object',
          properties: { next: { $dynamicRef: '#node' } },
        },
      },
    }))

    const projection = adapter.project({})
    expect(childKeys(projection, '/nested/next')).toEqual(['rootValue'])
    expect(projection.nodes.get(toPointer('/nested/next'))?.active).toBe(true)
    expect(projection.nodes.get(toPointer('/nested/next'))?.recursiveExpansion).toBe(true)
    expect(projection.nodes.get(toPointer('/nested'))?.boundaries).toEqual(['recursion'])
  })

  it('allows a property name that matches an applicator keyword', async () => {
    const adapter = await adapterFor(on2020({
      $dynamicAnchor: 'node',
      type: 'object',
      properties: {
        allOf: { $dynamicRef: '#node' },
        rootValue: { type: 'string' },
      },
    }))

    const projection = adapter.project({ allOf: {} })

    expect(childKeys(projection, '/allOf')).toEqual(['allOf', 'rootValue'])
  })

  it('projects references through same-instance applicators and array items', async () => {
    const adapter = await adapterFor(on2020({
      $id: 'https://example.test/root',
      $dynamicAnchor: 'node',
      type: 'object',
      required: ['value'],
      properties: {
        value: { type: 'string' },
        composed: { allOf: [{ $dynamicRef: '#node' }] },
        rows: { type: 'array', items: { $dynamicRef: '#node' } },
      },
    }))
    const data = {
      value: 'root',
      composed: { value: 'nested' },
      rows: [{ value: 'item' }],
    }
    const projection = adapter.project(data)

    expect(childKeys(projection, '/rows/0')).toContain('value')
    expect(childKeys(projection, '/composed')).toContain('value')
    expect((await adapter.validate(data)).valid).toBe(true)
    expect((await adapter.validate({ ...data, rows: [{}] })).valid).toBe(false)
  })

  it('uses active scope in anyOf and conditional schemas', async () => {
    const adapter = await adapterFor(on2020({
      $id: 'https://example.test/root',
      $dynamicAnchor: 'node',
      type: 'object',
      required: ['rootValue'],
      properties: {
        rootValue: { type: 'string' },
        branch: { anyOf: [{ $dynamicRef: 'https://example.test/base#node' }] },
        exclusive: {
          type: 'object',
          oneOf: [{ $dynamicRef: 'https://example.test/base#node' }],
        },
        dependent: {
          type: 'object',
          dependentSchemas: {
            trigger: { $dynamicRef: 'https://example.test/base#node' },
          },
        },
        conditional: {
          type: 'object',
          if: { properties: { selected: { const: true } } },
          then: { $dynamicRef: 'https://example.test/base#node' },
        },
      },
      $defs: {
        base: {
          $id: 'https://example.test/base',
          $dynamicAnchor: 'node',
          type: 'object',
          required: ['baseValue'],
          properties: { baseValue: { type: 'string' } },
        },
      },
    }))
    const data = {
      rootValue: 'root',
      branch: { rootValue: 'branch' },
      exclusive: { rootValue: 'exclusive' },
      dependent: { trigger: true, rootValue: 'dependent' },
      conditional: { selected: true, rootValue: 'conditional' },
    }
    const projection = adapter.project(data)

    expect(childKeys(projection, '/branch')).toContain('rootValue')
    expect(childKeys(projection, '/exclusive')).toContain('rootValue')
    expect(childKeys(projection, '/dependent')).toContain('rootValue')
    expect(childKeys(projection, '/conditional')).toContain('rootValue')
    expect((await adapter.validate(data)).valid).toBe(true)
    expect((await adapter.validate({ ...data, branch: { baseValue: 'base' } })).valid).toBe(false)
  })

  it('keeps reducer validation scope local to the selected conditional branch', async () => {
    const adapter = await adapterFor(on2020({
      type: 'object',
      properties: {
        choice: {
          type: 'object',
          if: {
            anyOf: [
              {
                $id: 'https://example.test/first',
                $dynamicAnchor: 'node',
                required: ['a'],
                properties: { a: { type: 'string' } },
              },
              {
                $id: 'https://example.test/second',
                $dynamicAnchor: 'node',
                required: ['b'],
                properties: {
                  b: { type: 'string' },
                  child: { $dynamicRef: '#node' },
                },
              },
            ],
          },
          then: { properties: { yes: { type: 'string' } } },
          else: { properties: { no: { type: 'string' } } },
        },
      },
    }))
    const data = { choice: { b: 'b', child: { b: 'child' } } }
    const projection = adapter.project(data)

    expect((await adapter.validate(data)).valid).toBe(true)
    expect(projection.nodes.get(toPointer('/choice/yes'))?.active).toBe(true)
    expect(projection.nodes.get(toPointer('/choice/no'))?.active).toBe(false)
  })

  it('keeps separately applicable additional properties in a scoped child', async () => {
    const adapter = await adapterFor(on2020({
      type: 'object',
      properties: {
        child: { $dynamicRef: '#node' },
      },
      allOf: [{
        additionalProperties: {
          type: 'object',
          required: ['extra'],
          properties: { extra: { type: 'string' } },
        },
      }],
      $defs: {
        target: {
          $dynamicAnchor: 'node',
          type: 'object',
          properties: { base: { type: 'string' } },
        },
      },
    }))
    const data = { child: { base: 'value' } }
    const projection = adapter.project(data)

    expect(childKeys(projection, '/child')).toEqual(expect.arrayContaining(['base', 'extra']))
    expect(projection.nodes.get(toPointer('/child'))?.children?.find(({ key }) => key === 'extra')?.required).toBe(true)
    expect((await adapter.validate(data)).valid).toBe(false)
  })

  it('preserves defaults from the dynamically selected resource', async () => {
    const adapter = await adapterFor(on2020({
      $dynamicAnchor: 'node',
      type: 'object',
      default: { rootValue: 'root' },
      properties: {
        rootValue: { type: 'string', default: 'root' },
        nested: { $ref: '#/$defs/base' },
      },
      $defs: {
        base: {
          $id: 'https://example.test/base',
          $dynamicAnchor: 'node',
          type: 'object',
          default: { baseValue: 'base' },
          properties: { next: { $dynamicRef: '#node' } },
        },
      },
    }))

    const projection = adapter.project({ nested: { next: {} } })
    const recursive = projection.nodes.get(toPointer('/nested/next'))!

    expect(recursive.annotations.default).toEqual({ rootValue: 'root' })
    expect(recursive.defaultConflict).toBeUndefined()
  })

  it('uses the rebound target during validation as well as projection', async () => {
    const adapter = await adapterFor(on2020({
      $id: 'https://example.test/root',
      $dynamicAnchor: 'node',
      type: 'object',
      required: ['rootValue'],
      properties: {
        rootValue: { type: 'string' },
        nested: { $ref: '#/$defs/base' },
      },
      $defs: {
        base: {
          $id: 'https://example.test/base',
          $dynamicAnchor: 'node',
          type: 'object',
          required: ['baseValue'],
          properties: {
            baseValue: { type: 'string' },
            next: { $dynamicRef: '#node' },
          },
        },
      },
    }))

    const projection = adapter.project({
      rootValue: 'root',
      nested: { baseValue: 'base', next: { rootValue: 'nested' } },
    })
    const result = await adapter.validate({
      rootValue: 'root',
      nested: { baseValue: 'base', next: { rootValue: 'nested' } },
    })
    const rejected = await adapter.validate({
      rootValue: 'root',
      nested: { baseValue: 'base', next: { baseValue: 'nested' } },
    })

    expect(result.valid).toBe(true)
    expect(rejected.valid).toBe(false)
    expect(projection.nodes.get(toPointer('/nested/next'))?.children?.some(({ key, required }) => key === 'rootValue' && required)).toBe(true)
  })

  it('honors recursion budgets on dynamically selected targets', async () => {
    const schema = on2020({
      $dynamicAnchor: 'node',
      type: 'object',
      properties: {
        rootValue: { type: 'string' },
        nested: { $ref: '#/$defs/base' },
      },
      $defs: {
        base: {
          $id: 'https://example.test/base',
          $dynamicAnchor: 'node',
          type: 'object',
          properties: {
            baseValue: { type: 'string' },
            next: { $dynamicRef: '#node' },
          },
        },
      },
    })
    const adapter = await createAdapter(schema, { dynamicReferenceProjection: 'local' }, { objects: 0, nodes: 0 })

    const projection = adapter.project({ nested: { baseValue: 'base', next: { rootValue: 'nested' } } })
    expect(childKeys(projection, '/nested/next')).toEqual(['rootValue', 'nested'])
    expect(projection.nodes.get(toPointer('/nested/next/nested'))?.boundaries).toContain('budget')
    expect(projection.nodes.has(toPointer('/nested/next/nested/next'))).toBe(false)
  })

  it('rejects unsupported dialects, reference siblings, and applicator paths', async () => {
    await expect(createJsonSchemaAdapter({
      properties: { next: { $dynamicRef: '#node' } },
    }, { dynamicReferenceProjection: 'local' })).rejects.toThrow('requires Draft 2019-09 or Draft 2020-12')

    await expect(adapterFor(on2020({
      $dynamicAnchor: 'node',
      properties: { next: { $dynamicRef: '#node', maxLength: 3 } },
    }))).rejects.toThrow('assertion siblings')

    await expect(adapterFor(on2020({
      $dynamicAnchor: 'node',
      properties: { next: { not: { $dynamicRef: '#node' } } },
    }))).rejects.toThrow('below unsupported applicators or tuple items')

    await expect(adapterFor(on2020({
      $id: 'https://example.test/root',
      $dynamicAnchor: 'node',
      type: 'object',
      properties: {
        safe: { $dynamicRef: '#node' },
        'a/b': { not: { $dynamicRef: '#node' } },
      },
    }))).rejects.toThrow('below unsupported applicators or tuple items')

    await expect(adapterFor(on2020({
      properties: { next: { $recursiveRef: '#' } },
    }))).rejects.toThrow('does not support $recursiveRef')

    await expect(adapterFor(on2020({
      $id: 'https://example.test/root',
      properties: { next: { $dynamicRef: 'https://json-schema.org/draft/2020-12/meta/core#meta' } },
    }))).rejects.toThrow('does not support external targets')

    await expect(adapterFor(on2020({
      properties: {
        nested: {
          $id: '/root-relative',
          type: 'object',
          properties: { allowed: true, next: { $dynamicRef: '#node' } },
          $defs: { node: { $dynamicAnchor: 'node', type: 'object' } },
        },
      },
    }))).rejects.toThrow('does not support root-relative resource identifiers')
  })

  it('supports boolean subschemas when the mode is enabled', async () => {
    const adapter = await adapterFor(on2020({
      type: 'object',
      properties: { free: true },
    }))

    expect(adapter.project({}).nodes.has(toPointer(''))).toBe(true)
  })
})

describe('local recursive reference projection', () => {
  const extensionSchema = on2019({
    $id: 'https://example.test/extension',
    $recursiveAnchor: true,
    type: 'object',
    required: ['label'],
    properties: { label: { type: 'string' } },
    allOf: [{ $ref: '#/$defs/base' }],
    $defs: {
      base: {
        $id: 'https://example.test/base',
        $recursiveAnchor: true,
        type: 'object',
        properties: {
          children: {
            type: 'array',
            items: { $recursiveRef: '#' },
          },
        },
      },
    },
  })

  it('projects recursive object properties and validates them', async () => {
    const adapter = await createJsonSchemaAdapter(on2019({
      $id: 'https://example.test/tree',
      $recursiveAnchor: true,
      type: 'object',
      required: ['label'],
      properties: {
        label: { type: 'string' },
        child: { $recursiveRef: '#' },
      },
    }), { dynamicReferenceProjection: 'local' })
    const projection = adapter.project({ label: 'root', child: { label: 'child' } })

    expect(childKeys(projection, '/child')).toContain('label')
    expect(childKeys(projection, '/child')).toContain('child')
    expect((await adapter.validate({ label: 'root', child: { label: 'child' } })).valid).toBe(true)
    expect((await adapter.validate({ label: 'root', child: {} })).valid).toBe(false)
  })

  it('keeps recursive references static when their target has no recursive anchor', async () => {
    const adapter = await createJsonSchemaAdapter(on2019({
      $id: 'https://example.test/root',
      type: 'object',
      required: ['top'],
      properties: {
        top: { type: 'string' },
        envelope: {
          $recursiveAnchor: true,
          type: 'object',
          required: ['inner'],
          properties: {
            inner: { type: 'string' },
            child: { $recursiveRef: '#' },
          },
        },
      },
    }), { dynamicReferenceProjection: 'local' })
    const data = { top: 'root', envelope: { inner: 'value', child: { top: 'child' } } }
    const projection = adapter.project(data)

    expect(childKeys(projection, '/envelope/child')).toContain('top')
    expect(childKeys(projection, '/envelope/child')).not.toContain('inner')
    expect((await adapter.validate(data)).valid).toBe(true)
  })

  it('rebinds recursive references in array items to the outer recursive anchor', async () => {
    const adapter = await createJsonSchemaAdapter(extensionSchema, { dynamicReferenceProjection: 'local' })
    const projection = adapter.project({ label: 'root', children: [{ label: 'child' }] })

    expect(childKeys(projection, '/children/0')).toContain('label')
    expect(childKeys(projection, '/children/0')).toContain('children')
  })

  it('projects recursive references through same-instance applicators', async () => {
    const adapter = await createJsonSchemaAdapter(on2019({
      $id: 'https://example.test/root',
      $recursiveAnchor: true,
      type: 'object',
      required: ['top'],
      properties: {
        top: { type: 'string' },
        composed: { allOf: [{ $recursiveRef: '#' }] },
      },
    }), { dynamicReferenceProjection: 'local' })
    const data = { top: 'root', composed: { top: 'nested' } }
    const projection = adapter.project(data)

    expect(childKeys(projection, '/composed')).toContain('top')
    expect((await adapter.validate(data)).valid).toBe(true)
    expect((await adapter.validate({ top: 'root', composed: {} })).valid).toBe(false)
  })

  it('rebinds an inline recursive anchor to its enclosing resource root', async () => {
    const adapter = await createJsonSchemaAdapter(on2019({
      $id: 'https://example.test/root',
      type: 'object',
      required: ['top'],
      properties: {
        top: { type: 'string' },
        envelope: {
          $recursiveAnchor: true,
          type: 'object',
          required: ['inner'],
          properties: { inner: { type: 'string' } },
          allOf: [{ $ref: '#/$defs/base' }],
        },
      },
      $defs: {
        base: {
          $id: 'https://example.test/base',
          $recursiveAnchor: true,
          type: 'object',
          required: ['base'],
          properties: {
            base: { type: 'string' },
            children: {
              type: 'array',
              items: { $recursiveRef: '#' },
            },
          },
        },
      },
    }), { dynamicReferenceProjection: 'local' })
    const data = {
      top: 'root',
      envelope: {
        inner: 'value',
        base: 'base',
        children: [{ top: 'child' }],
      },
    }
    const projection = adapter.project(data)

    expect(childKeys(projection, '/envelope/children/0')).toContain('top')
    expect(childKeys(projection, '/envelope/children/0')).not.toContain('inner')
    expect((await adapter.validate(data)).valid).toBe(true)
    expect((await adapter.validate({
      ...data,
      envelope: { ...data.envelope, children: [{}] },
    })).valid).toBe(false)
  })

  it('uses the rebound target during validation', async () => {
    const adapter = await createJsonSchemaAdapter(extensionSchema, { dynamicReferenceProjection: 'local' })

    expect((await adapter.validate({ label: 'root', children: [{ label: 'child' }] })).valid).toBe(true)
    expect((await adapter.validate({ label: 'root', children: [{}] })).valid).toBe(false)
  })

  it('keeps recursive validation scope local to the active property path', async () => {
    const adapter = await createJsonSchemaAdapter(on2019({
      $id: 'https://example.test/root',
      type: 'object',
      properties: {
        first: {
          $id: 'https://example.test/first',
          $recursiveAnchor: true,
          type: 'object',
          required: ['a'],
          properties: { a: { type: 'string' } },
        },
        second: {
          $id: 'https://example.test/second',
          $recursiveAnchor: true,
          type: 'object',
          required: ['b'],
          properties: {
            b: { type: 'string' },
            child: { $recursiveRef: '#' },
          },
        },
      },
    }), { dynamicReferenceProjection: 'local' })

    for (const data of [
      { first: { a: 'a' }, second: { b: 'b', child: { b: 'child' } } },
      { second: { b: 'b', child: { b: 'child' } }, first: { a: 'a' } },
    ]) {
      expect((await adapter.validate(data)).valid).toBe(true)
    }
  })

  it('preserves recursive scope while projection reducers evaluate conditions', async () => {
    const adapter = await createJsonSchemaAdapter(on2019({
      $id: 'https://example.test/root',
      $recursiveAnchor: true,
      type: 'object',
      required: ['label'],
      properties: { label: { type: 'string' } },
      if: { $ref: '#/$defs/base' },
      then: { properties: { yes: { type: 'string' } } },
      else: { properties: { no: { type: 'string' } } },
      $defs: {
        base: {
          $id: 'https://example.test/base',
          $recursiveAnchor: true,
          type: 'object',
          properties: { child: { $recursiveRef: '#' } },
        },
      },
    }), { dynamicReferenceProjection: 'local' })
    const projection = adapter.project({ label: 'root', child: {} })

    expect(projection.nodes.get(toPointer('/no'))?.active).toBe(true)
    expect(projection.nodes.get(toPointer('/yes'))?.active).toBe(false)
  })

  it('classifies applicators separately from property names after array items', async () => {
    const adapter = await createJsonSchemaAdapter(on2019({
      $recursiveAnchor: true,
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { allOf: { $recursiveRef: '#' } },
          },
        },
      },
    }), { dynamicReferenceProjection: 'local' })
    const projection = adapter.project({ rows: [{ allOf: {} }] })

    expect(childKeys(projection, '/rows/0/allOf')).toContain('rows')

    await expect(createJsonSchemaAdapter(on2019({
      $recursiveAnchor: true,
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { child: { not: { $recursiveRef: '#' } } },
          },
        },
      },
    }), { dynamicReferenceProjection: 'local' })).rejects.toThrow('below unsupported applicators or tuple items')

    await expect(createJsonSchemaAdapter(on2019({
      $recursiveAnchor: true,
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: [{ type: 'object', properties: { child: { $recursiveRef: '#' } } }],
        },
      },
    }), { dynamicReferenceProjection: 'local' })).rejects.toThrow('below unsupported applicators or tuple items')

    await expect(createJsonSchemaAdapter(on2019({
      $recursiveAnchor: true,
      type: 'object',
      properties: { '%61': { not: { $recursiveRef: '#' } } },
    }), { dynamicReferenceProjection: 'local' })).rejects.toThrow('below unsupported applicators or tuple items')
  })

  it('rejects unsupported recursive reference values, siblings, and applicator paths', async () => {
    await expect(createJsonSchemaAdapter(on2019({
      $recursiveAnchor: true,
      properties: { child: { $recursiveRef: '#/$defs/base' } },
      $defs: { base: true },
    }), { dynamicReferenceProjection: 'local' })).rejects.toThrow('only supports the $recursiveRef value "#"')

    await expect(createJsonSchemaAdapter(on2019({
      $recursiveAnchor: true,
      properties: { child: { not: { $recursiveRef: '#' } } },
    }), { dynamicReferenceProjection: 'local' })).rejects.toThrow('below unsupported applicators or tuple items')

    await expect(createJsonSchemaAdapter(on2019({
      $recursiveAnchor: true,
      properties: {
        child: {
          $recursiveRef: '#',
          required: ['extra'],
          properties: { extra: { type: 'string' } },
        },
      },
    }), { dynamicReferenceProjection: 'local' })).rejects.toThrow('does not support siblings beside $recursiveRef')
  })
})

describe('dynamic references in resolver supplied resources', () => {
  it('projects remote recursion against the root dynamic anchor and uses the same target for validation', async () => {
    const baseUri = 'https://forms.example.test/dynamic-tree.json'
    const adapter = await createJsonSchemaAdapter(on2020({
      $id: 'https://forms.example.test/root.json',
      $dynamicAnchor: 'node',
      $ref: `${baseUri}#node`,
      required: ['extension'],
      properties: { extension: { type: 'string' } },
    }), {
      dynamicReferenceProjection: 'local',
      resolveResource: (uri) => uri === baseUri ? ({
        $id: baseUri,
        $dynamicAnchor: 'node',
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          children: { type: 'array', items: { $dynamicRef: '#node' } },
        },
      }) : undefined,
    })

    const data = {
      name: 'Ada',
      extension: 'root',
      children: [{ name: 'Grace', extension: 'child' }],
    }
    const projection = adapter.project(data)

    expect(childKeys(projection, '/children/0')).toContain('extension')
    expect(projection.nodes.has('/children/0/extension' as never)).toBe(true)
    expect((await adapter.validate(data)).valid).toBe(true)
    expect((await adapter.validate({ ...data, children: [{ name: 'Grace' }] })).valid).toBe(false)
  })

  it('keeps sibling external dynamic scopes attached to their own resources', async () => {
    const firstUri = 'https://forms.example.test/first-tree.json'
    const secondUri = 'https://forms.example.test/second-tree.json'
    const adapter = await createJsonSchemaAdapter(on2020({
      $id: 'https://forms.example.test/root.json',
      type: 'object',
      properties: {
        first: { $dynamicRef: `${firstUri}#node` },
        second: { $dynamicRef: `${secondUri}#node` },
      },
    }), {
      dynamicReferenceProjection: 'local',
      resolveResource: (uri) => uri === firstUri
        ? {
            $id: firstUri,
            $dynamicAnchor: 'node',
            type: 'object',
            additionalProperties: false,
            properties: { firstOnly: { type: 'string' }, next: { $dynamicRef: '#node' } },
          }
        : uri === secondUri
          ? {
              $id: secondUri,
              $dynamicAnchor: 'node',
              type: 'object',
              additionalProperties: false,
              properties: { secondOnly: { type: 'number' }, next: { $dynamicRef: '#node' } },
            }
          : undefined,
    })

    const projection = adapter.project({ first: { next: {} }, second: { next: {} } })

    expect(childKeys(projection, '/first/next')).toEqual(['firstOnly', 'next'])
    expect(childKeys(projection, '/second/next')).toEqual(['secondOnly', 'next'])
    expect((await adapter.validate({
      first: { firstOnly: 'a', next: { firstOnly: 'b' } },
      second: { secondOnly: 1, next: { secondOnly: 2 } },
    })).valid).toBe(true)
    expect((await adapter.validate({
      first: { firstOnly: 'a', next: { secondOnly: 2 } },
      second: { secondOnly: 1, next: { firstOnly: 'b' } },
    })).valid).toBe(false)
  })
})
