import { describe, it, expect } from 'vitest'
import type { JsonPointer, NodeProjection, SchemaProjection, UINode } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { componentTester, fromUiSchema } from '../index.js'

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    bio: { type: 'string', description: 'About you' },
    age: { type: 'integer' },
    agree: { type: 'boolean' },
    colour: { type: 'string', enum: ['red', 'green'] },
    locked: { type: 'string', readOnly: true },
    address: { type: 'object', properties: { city: { type: 'string' } } },
    tags: { type: 'array', items: { type: 'string' } },
  },
}

async function convert(uiSchema: unknown, over: object = schema) {
  const port = await createJsonSchemaAdapter(over)
  return fromUiSchema(uiSchema, port.project({}))
}

const at = (pointer: string) => pointer as JsonPointer

describe('the disposition table', () => {
  it('writes placeholder, helpText and textarea hints on fields', async () => {
    const conversion = await convert({
      name: { 'ui:placeholder': 'Ada', 'ui:widget': 'textarea' },
      age: { 'ui:placeholder': '42', 'ui:description': 'Years' },
      agree: { 'ui:placeholder': 'ignored', 'ui:help': 'Tick it' },
    })
    expect(conversion.hints).toEqual({
      '/name': { placeholder: 'Ada', widget: 'textarea' },
      '/age': { placeholder: '42', helpText: 'Years' },
      '/agree': { helpText: 'Tick it' },
      '/tags': { canReorder: true },
    })
    expect(conversion.issues).toEqual([])
    expect(conversion.components).toEqual([])
  })

  it('reports a placeholder on a select and descriptions on containers', async () => {
    const conversion = await convert({
      colour: { 'ui:placeholder': 'Pick' },
      address: { 'ui:description': 'Where', 'ui:help': 'Postal' },
    })
    expect(conversion.issues.map((issue) => [issue.code, issue.key, issue.path, issue.pointer])).toEqual([
      ['unsupported', 'ui:placeholder', '/colour/ui:placeholder', '/colour'],
      ['unsupported', 'ui:description', '/address/ui:description', '/address'],
      ['unsupported', 'ui:help', '/address/ui:help', '/address'],
    ])
    expect(conversion.hints).toEqual({ '/tags': { canReorder: true } })
  })

  it('reports help beside a description as a conflict', async () => {
    const conversion = await convert({
      bio: { 'ui:help': 'Keep it short' },
      name: { 'ui:help': 'Full name', 'ui:description': 'As on your passport' },
    })
    expect(conversion.hints['/bio']).toBeUndefined()
    expect(conversion.hints['/name']).toEqual({ helpText: 'As on your passport' })
    expect(conversion.issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['conflict', '/bio/ui:help'],
      ['conflict', '/name/ui:help'],
    ])
  })

  it('reports keys with no destination and stays quiet about keys RJSF ignores there', async () => {
    const conversion = await convert({
      'ui:submitButtonOptions': { norender: true },
      name: { 'ui:title': 'Name', 'ui:autofocus': true, 'ui:disabled': false, 'ui:label': true, 'ui:emptyValue': '' },
      bio: { 'ui:title': 'Biography', 'ui:rows': 4, 'ui:classNames': 'wide' },
      locked: { 'ui:readonly': true },
      agree: { 'ui:readonly': true, 'ui:enumNames': ['Yes', 'No'], 'ui:inputType': 'tel' },
      colour: { 'ui:enumNames': ['Red', 'Green'], 'ui:enumDisabled': ['green'] },
      tags: { 'ui:addable': false, 'ui:removable': true, 'ui:copyable': true, 'ui:ArrayFieldTemplate': 'Compact' },
      address: { 'ui:backstage': { review: { show: false } }, 'ui:custom': 1 },
    })
    expect(conversion.issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['unsupported', '/ui:submitButtonOptions'],
      ['unsupported', '/name/ui:autofocus'],
      ['unsupported', '/name/ui:emptyValue'],
      ['unsupported', '/bio/ui:title'],
      ['unsupported', '/bio/ui:classNames'],
      ['unsupported', '/agree/ui:readonly'],
      ['unsupported', '/colour/ui:enumNames'],
      ['unsupported', '/colour/ui:enumDisabled'],
      ['unsupported', '/tags/ui:addable'],
      ['unsupported', '/tags/ui:copyable'],
      ['unsupported', '/tags/ui:ArrayFieldTemplate'],
      ['unsupported', '/address/ui:backstage'],
    ])
  })

  it('routes component names to requirements and never renders hidden', async () => {
    const conversion = await convert({
      name: { 'ui:widget': 'password' },
      bio: { 'ui:widget': 'hidden' },
      age: { 'ui:widget': 'updown', 'ui:field': 'AgePicker' },
      agree: { 'ui:widget': 'checkbox' },
      colour: { 'ui:widget': 'select' },
      address: { 'ui:widget': 'anything', city: { 'ui:widget': 'text' } },
      tags: { 'ui:widget': 'checkboxes' },
    })
    expect(conversion.components).toEqual([
      { name: 'password', key: 'ui:widget', path: '/name/ui:widget', pointer: '/name', rows: false },
      { name: 'AgePicker', key: 'ui:field', path: '/age/ui:field', pointer: '/age', rows: false },
      { name: 'checkboxes', key: 'ui:widget', path: '/tags/ui:widget', pointer: '/tags', rows: false },
    ])
    expect(conversion.issues).toEqual([
      {
        code: 'unsupported',
        key: 'ui:widget',
        path: '/bio/ui:widget',
        pointer: '/bio',
        value: 'hidden',
        message: expect.stringContaining('visible and editable'),
      },
    ])
    expect(conversion.hints).toEqual({})
  })

  it('treats a textarea on a non-string as a component the host renders', async () => {
    const conversion = await convert({
      age: { 'ui:widget': 'textarea' },
      bio: { 'ui:widget': 'textarea', 'ui:options': { rows: 5 } },
    })
    expect(conversion.components.map((requirement) => [requirement.name, requirement.pointer])).toEqual([['textarea', '/age']])
    expect(conversion.hints['/bio']).toEqual({ widget: 'textarea' })
    expect(conversion.issues.map((issue) => [issue.code, issue.path])).toEqual([['unsupported', '/bio/ui:options/rows']])
  })

  it('hands a component its subtree instead of converting it', async () => {
    const conversion = await convert({
      address: { 'ui:field': 'AddressPicker', 'ui:title': 'Where', city: { 'ui:placeholder': 'Paris', 'ui:autofocus': true }, nope: {} },
    })
    expect(conversion.hints).toEqual({ '/tags': { canReorder: true } })
    expect(conversion.issues).toEqual([])
    expect(conversion.uiSchemaAt(at('/address'))).toEqual({
      component: 'AddressPicker',
      options: { field: 'AddressPicker', title: 'Where' },
      uiSchema: { 'ui:field': 'AddressPicker', 'ui:title': 'Where', city: { 'ui:placeholder': 'Paris', 'ui:autofocus': true }, nope: {} },
    })
  })

  it('writes canReorder for every array the uiSchema does not forbid', async () => {
    expect((await convert({})).hints).toEqual({ '/tags': { canReorder: true } })
    expect((await convert({ tags: { 'ui:orderable': false } })).hints).toEqual({ '/tags': { canReorder: false } })
    expect((await convert({ 'ui:globalOptions': { orderable: false } })).hints).toEqual({ '/tags': { canReorder: false } })
    expect(
      (await convert({ 'ui:globalOptions': { orderable: false }, tags: { 'ui:options': { orderable: true } } })).hints,
    ).toEqual({ '/tags': { canReorder: true } })
  })

  it('reports a global option once, at its own path', async () => {
    const conversion = await convert({ 'ui:globalOptions': { label: false, addable: true, copyable: true } })
    expect(conversion.issues.map((issue) => [issue.code, issue.key, issue.path])).toEqual([
      ['unsupported', 'ui:label', '/ui:globalOptions/label'],
      ['unsupported', 'ui:copyable', '/ui:globalOptions/copyable'],
    ])
  })

  it('converts ui:order onto the children', async () => {
    const conversion = await convert({ 'ui:order': ['bio', '*', 'name'] })
    expect(conversion.hints['/bio']).toEqual({ order: -1 })
    expect(conversion.hints['/name']).toEqual({ order: 2 ** 40 })
  })
})

describe('nesting', () => {
  it('reports a key naming no projected child', async () => {
    const conversion = await convert({ nmae: { 'ui:placeholder': 'x' }, classNames: 'old' })
    expect(conversion.issues.map((issue) => [issue.code, issue.key, issue.path, issue.pointer])).toEqual([
      ['unknown-location', 'nmae', '/nmae', ''],
      ['unsupported', 'classNames', '/classNames', ''],
    ])
  })

  it('lets a property named like a nesting keyword name that property', async () => {
    const conversion = await convert(
      { items: { 'ui:placeholder': 'a' }, oneOf: { 'ui:placeholder': 'b' } },
      { type: 'object', properties: { items: { type: 'string' }, oneOf: { type: 'string' } } },
    )
    expect(conversion.hints).toEqual({ '/items': { placeholder: 'a' }, '/oneOf': { placeholder: 'b' } })
    expect(conversion.issues).toEqual([])
  })

  it('reports every row hint as unaddressable and routes a row component', async () => {
    const rows = await convert({ tags: { items: { 'ui:placeholder': 'tag', 'ui:widget': 'text', 'ui:inline': true } } })
    expect(rows.issues.map((issue) => [issue.code, issue.path, issue.pointer])).toEqual([
      ['unaddressable', '/tags/items/ui:placeholder', undefined],
    ])
    const component = await convert({ tags: { items: { 'ui:field': 'TagPicker', 'ui:options': { max: 3 } } } })
    expect(component.components).toEqual([
      { name: 'TagPicker', key: 'ui:field', path: '/tags/items/ui:field', pointer: '/tags', rows: true },
    ])
    expect(component.issues).toEqual([])
    expect(component.uiSchemaAt(at('/tags/4'))?.options).toEqual({ field: 'TagPicker', max: 3 })
  })

  it('addresses tuple positions only where the projection has a node', async () => {
    const unprojected = await convert(
      { pair: { items: [{ 'ui:placeholder': 'first' }] } },
      { type: 'object', properties: { pair: { type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }] } } },
    )
    expect(unprojected.issues.map((issue) => [issue.code, issue.path, issue.pointer])).toEqual([
      ['unaddressable', '/pair/items/0/ui:placeholder', '/pair/0'],
    ])
    const projection: SchemaProjection = {
      nodes: new Map<JsonPointer, NodeProjection>([
        [at(''), { type: 'object', constraints: {}, active: true, annotations: {}, children: [{ pointer: at('/pair'), key: 'pair', required: false }] }],
        [at('/pair'), { type: 'array', constraints: {}, active: true, annotations: {} }],
        [at('/pair/0'), { type: 'string', constraints: {}, active: true, annotations: {} }],
      ]),
    }
    const projected = fromUiSchema({ pair: { items: [{ 'ui:placeholder': 'first' }, { 'ui:placeholder': 'second' }] } }, projection)
    expect(projected.hints).toEqual({ '/pair': { canReorder: true }, '/pair/0': { placeholder: 'first' } })
    expect(projected.issues.map((issue) => [issue.code, issue.path, issue.pointer])).toEqual([
      ['unaddressable', '/pair/items/1/ui:placeholder', '/pair/1'],
    ])
    expect(projected.uiSchemaAt(at('/pair/0'))?.options).toEqual({ placeholder: 'first' })
  })

  it('reports additionalProperties, additionalItems and option uiSchemas', async () => {
    const conversion = await convert({
      additionalProperties: { 'ui:placeholder': 'x' },
      tags: { additionalItems: { 'ui:title': 't' } },
      address: { oneOf: [{ city: { 'ui:placeholder': 'a', 'ui:inline': true } }, { 'ui:field': 'Other' }] },
    })
    expect(conversion.issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['unaddressable', '/additionalProperties/ui:placeholder'],
      ['unaddressable', '/tags/additionalItems/ui:title'],
      ['conditional', '/address/oneOf/0/city/ui:placeholder'],
      ['conditional', '/address/oneOf/1/ui:field'],
    ])
    expect(conversion.components).toEqual([])
  })

  it('accepts properties declared only in branches', async () => {
    const conversion = await convert(
      { extra: { 'ui:placeholder': 'e' }, more: { 'ui:placeholder': 'm' }, pick: { a: { 'ui:placeholder': 'a' }, b: { 'ui:placeholder': 'b' } } },
      {
        type: 'object',
        properties: {
          flag: { type: 'boolean' },
          kind: { type: 'string' },
          pick: { type: 'object', oneOf: [{ properties: { a: { type: 'string' } } }, { properties: { b: { type: 'string' } } }] },
        },
        dependencies: { flag: { properties: { extra: { type: 'string' } } } },
        if: { properties: { kind: { const: 'x' } } },
        then: { properties: { more: { type: 'string' } } },
      },
    )
    expect(conversion.issues).toEqual([])
    expect(conversion.hints).toEqual({
      '/extra': { placeholder: 'e' },
      '/more': { placeholder: 'm' },
      '/pick/a': { placeholder: 'a' },
      '/pick/b': { placeholder: 'b' },
    })
  })

  it('escapes property names in pointers and paths', async () => {
    const conversion = await convert(
      { 'a/b': { 'ui:placeholder': 'x' }, 'c~d': { 'ui:autofocus': true }, 'e/f': {} },
      { type: 'object', properties: { 'a/b': { type: 'string' }, 'c~d': { type: 'string' } } },
    )
    expect(conversion.hints).toEqual({ '/a~1b': { placeholder: 'x' } })
    expect(conversion.issues.map((issue) => [issue.code, issue.path, issue.pointer])).toEqual([
      ['unsupported', '/c~0d/ui:autofocus', '/c~0d'],
      ['unknown-location', '/e~1f', ''],
    ])
    expect(conversion.uiSchemaAt(at('/a~1b'))?.options).toEqual({ placeholder: 'x' })
  })
})

describe('uiSchemaAt and componentTester', () => {
  it('walks property names and items only', async () => {
    const uiSchema = { name: { 'ui:help': 'h' }, tags: { items: { 'ui:title': 'Tag' } }, address: { oneOf: [{ city: {} }] } }
    const conversion = await convert(uiSchema)
    expect(conversion.uiSchemaAt(at('/name'))).toEqual({ options: { help: 'h' }, uiSchema: { 'ui:help': 'h' } })
    expect(conversion.uiSchemaAt(at('/tags/12'))?.options).toEqual({ title: 'Tag' })
    expect(conversion.uiSchemaAt(at('/tags/01'))).toBeUndefined()
    expect(conversion.uiSchemaAt(at('/address/city'))).toBeUndefined()
    expect(conversion.uiSchemaAt(at('/age'))).toBeUndefined()
    expect(conversion.uiSchemaAt(at('name'))).toBeUndefined()
    expect(conversion.uiSchemaAt(at('/name/ui:help'))).toBeUndefined()
    expect(conversion.uiSchemaAt(at(''))?.uiSchema).toEqual(uiSchema)
  })

  it('matches a node by the component at its location', async () => {
    const conversion = await convert({ name: { 'ui:field': 'NamePicker' } })
    const node = (dataPointer: string | null) =>
      ({ id: 'n', type: 'field', parentId: null, dataPointer, order: 0, visible: true, disabled: false, readOnly: false, annotations: {}, fieldType: 'string', constraints: {} }) as unknown as UINode
    const tester = componentTester(conversion, 'NamePicker')
    expect(tester.rank).toBe(10)
    expect(componentTester(conversion, 'NamePicker', 3).rank).toBe(3)
    expect(tester.test(node('/name'))).toBe(true)
    expect(tester.test(node('/bio'))).toBe(false)
    expect(tester.test(node(null))).toBe(false)
    expect(componentTester(conversion, 'Other').test(node('/name'))).toBe(false)
  })
})

describe('totality', () => {
  it('reports values outside the profile and never throws', async () => {
    const projection = (await createJsonSchemaAdapter(schema)).project({})
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const hostile = new Proxy({}, {
      ownKeys() {
        throw new Error('no')
      },
    })
    const inputs: unknown[] = [
      42,
      null,
      'x',
      () => 1,
      cyclic,
      hostile,
      [1],
      { name: { 'ui:placeholder': Number.NaN } },
      { name: { 'ui:widget': { a: 1 } } },
      { name: { 'ui:options': 'odd' } },
      { 'ui:globalOptions': 3 },
      { name: 'text' },
      { tags: { items: 7 } },
      { 'ui:order': 'name' },
    ]
    for (const input of inputs) expect(() => fromUiSchema(input, projection)).not.toThrow()
    const codes = (input: unknown, over: SchemaProjection = projection) =>
      fromUiSchema(input, over).issues.map((issue) => [issue.code, issue.path])
    expect(codes(42)).toEqual([['invalid-value', '']])
    expect(codes(cyclic)).toEqual([['invalid-value', '/self']])
    expect(codes({ name: { 'ui:placeholder': Number.NaN } })).toEqual([['invalid-value', '/name/ui:placeholder']])
    expect(codes({ name: { 'ui:widget': { a: 1 } } })).toEqual([['invalid-value', '/name/ui:widget']])
    expect(codes({ name: { 'ui:options': 'odd' } })).toEqual([['invalid-value', '/name/ui:options']])
    const shapes = fromUiSchema({ name: { 'ui:widget': { a: 1 }, 'ui:options': 'odd' } }, projection).issues
    expect(shapes.map((issue) => [issue.path, issue.pointer])).toEqual([
      ['/name/ui:widget', '/name'],
      ['/name/ui:options', '/name'],
    ])
    const unprojected = fromUiSchema({ 'ui:widget': { a: 1 } }, { nodes: new Map() }).issues
    expect(unprojected.map((issue) => [issue.code, issue.path, issue.pointer])).toEqual([['invalid-value', '/ui:widget', '']])
    expect(codes({ name: 'text' })).toEqual([['invalid-value', '/name']])
    expect(codes({ tags: { items: 7 } })).toEqual([['invalid-value', '/tags/items']])
    expect(codes(undefined)).toEqual([])
    expect(codes({ 'ui:title': 'x' }, { nodes: new Map() })).toEqual([['unaddressable', '/ui:title']])
  })

  it('never throws over a malformed projection argument', async () => {
    const port = await createJsonSchemaAdapter(schema)
    const projection = port.project({})
    const uiSchema = { name: { 'ui:placeholder': 'x' }, age: { 'ui:placeholder': 'y' } }
    expect(() => fromUiSchema(projection as unknown, uiSchema as never)).not.toThrow()
    expect(() => fromUiSchema(uiSchema, undefined as never)).not.toThrow()
    expect(() => fromUiSchema({}, { nodes: {} } as never)).not.toThrow()
    const nullNode: SchemaProjection = { nodes: new Map([[at(''), null as never]]) }
    expect(() => fromUiSchema(uiSchema, nullNode)).not.toThrow()
    const noAnnotations: SchemaProjection = {
      nodes: new Map<JsonPointer, NodeProjection>([
        [at(''), { type: 'object', constraints: {}, active: true, children: [{ pointer: at('/name'), key: 'name', required: false }] } as unknown as NodeProjection],
        [at('/name'), { type: 'string', constraints: {}, active: true } as unknown as NodeProjection],
      ]),
    }
    expect(() => fromUiSchema(uiSchema, noAnnotations)).not.toThrow()
    const selfChild: SchemaProjection = {
      nodes: new Map<JsonPointer, NodeProjection>([
        [at(''), { type: 'object', constraints: {}, active: true, annotations: {}, children: [{ pointer: at(''), key: '', required: false }] }],
      ]),
    }
    expect(() => fromUiSchema({}, selfChild)).not.toThrow()
  })

  it('reports the projection object as invalid JSON when swapped in, and every key as unaddressable when the projection is undefined', async () => {
    const port = await createJsonSchemaAdapter(schema)
    const projection = port.project({})
    const uiSchema = { name: { 'ui:placeholder': 'x' }, age: { 'ui:placeholder': 'y' } }
    const swapped = fromUiSchema(projection as unknown, uiSchema as never)
    expect(swapped.issues.map((issue) => [issue.code, issue.path])).toEqual([['invalid-value', '/nodes']])
    const undef = fromUiSchema(uiSchema, undefined as never)
    expect(undef.issues.length).toBeGreaterThan(0)
    expect(undef.issues.every((issue) => issue.code === 'unaddressable')).toBe(true)
  })

  it('caps a uiSchema nested past 256 levels and stays total', async () => {
    const port = await createJsonSchemaAdapter(schema)
    const projection = port.project({})
    let nested: unknown = true
    for (let i = 0; i < 300; i++) nested = { a: nested }
    expect(() => fromUiSchema({ additionalProperties: nested }, projection)).not.toThrow()
    const conversion = fromUiSchema({ additionalProperties: nested }, projection)
    expect(conversion.issues).toHaveLength(1)
    expect(conversion.issues[0]?.code).toBe('invalid-value')
    expect(conversion.issues[0]?.message).toContain('256')

    let items: unknown = { 'ui:placeholder': 'x' }
    for (let i = 0; i < 5000; i++) items = { items }
    expect(() => fromUiSchema({ tags: items }, projection)).not.toThrow()
  })
})

describe('fix round 1', () => {
  it('lets a property named the empty string live at pointer /', async () => {
    const conversion = await convert(
      { '': { 'ui:placeholder': 'x' } },
      { type: 'object', properties: { '': { type: 'string' } } },
    )
    expect(conversion.hints['/']).toEqual({ placeholder: 'x' })
    expect(conversion.uiSchemaAt(at('/'))?.options).toEqual({ placeholder: 'x' })
  })

  it('matches componentTester against a row added after the conversion', async () => {
    const conversion = await convert({ tags: { items: { 'ui:field': 'TagPicker' } } })
    const node = {
      id: 'n',
      type: 'field',
      parentId: null,
      dataPointer: '/tags/3',
      order: 0,
      visible: true,
      disabled: false,
      readOnly: false,
      annotations: {},
      fieldType: 'string',
      constraints: {},
    } as unknown as UINode
    expect(componentTester(conversion, 'TagPicker').test(node)).toBe(true)
  })

  it('reports every non-typed global option key once and keeps typed ones effective', async () => {
    const conversion = await convert({ 'ui:globalOptions': { placeholder: 'x', widget: 'password', orderable: false } })
    expect(conversion.issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['unsupported', '/ui:globalOptions/placeholder'],
      ['unsupported', '/ui:globalOptions/widget'],
    ])
    expect(conversion.components).toEqual([])
    expect(conversion.hints['/tags']).toEqual({ canReorder: false })
  })

  it('treats the root itself as a component and skips global reporting', async () => {
    const conversion = await convert({ 'ui:field': 'Whole', 'ui:globalOptions': { label: false } })
    expect(conversion.issues).toEqual([])
    expect(conversion.components).toEqual([{ name: 'Whole', key: 'ui:field', path: '/ui:field', pointer: '', rows: false }])
  })

  it('keeps a row entry at unknown kind whether or not the row was projected', async () => {
    const port = await createJsonSchemaAdapter({ type: 'object', properties: { nums: { type: 'array', items: { type: 'number' } } } })
    const conversion = fromUiSchema({ nums: { items: { 'ui:widget': 'textarea' } } }, port.project({ nums: [1] }))
    expect(conversion.uiSchemaAt(at('/nums/0'))?.component).toBeUndefined()
    expect(conversion.uiSchemaAt(at('/nums/7'))?.component).toBeUndefined()
    expect(conversion.issues.map((issue) => issue.code)).toEqual(['unaddressable'])
  })

  it('reports invalid-value for non-object subtree and row values', async () => {
    const conversion = await convert({
      additionalProperties: 'x',
      address: { oneOf: ['x', { city: 5 }] },
      tags: { items: { 'ui:field': 5 } },
    })
    expect(conversion.issues.map((issue) => [issue.code, issue.key, issue.path])).toEqual([
      ['invalid-value', 'additionalProperties', '/additionalProperties'],
      ['invalid-value', '0', '/address/oneOf/0'],
      ['invalid-value', 'city', '/address/oneOf/1/city'],
      ['invalid-value', 'ui:field', '/tags/items/ui:field'],
    ])
  })

  it('returns undefined for a pointer that is not a string', async () => {
    const conversion = await convert({})
    expect(conversion.uiSchemaAt(42 as never)).toBeUndefined()
  })
})
