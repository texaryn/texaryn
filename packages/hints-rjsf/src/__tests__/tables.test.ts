import { describe, it, expect } from 'vitest'
import { getWidget } from '@rjsf/utils'
import type { JsonPointer, NodeProjection } from '@texaryn/core'
import { AFTER_WILDCARD, convertOrder } from '../order.js'
import { dispose, isInert } from '../table.js'
import type { KeyContext } from '../table.js'
import { kindOf, widgetOutcome } from '../widgets.js'
import type { NodeKind } from '../widgets.js'

function node(overrides: Partial<NodeProjection> = {}): NodeProjection {
  return { type: 'string', constraints: {}, active: true, annotations: {}, ...overrides }
}

function context(kind: NodeKind, overrides: Partial<KeyContext> = {}): KeyContext {
  return { kind, node: node(), options: new Map(), readOnly: false, root: false, ...overrides }
}

describe('kindOf', () => {
  it('reads the projected type, enum first', () => {
    expect(kindOf(node())).toBe('string')
    expect(kindOf(node({ type: 'integer' }))).toBe('number')
    expect(kindOf(node({ enumValues: [{ value: 'a' }] }))).toBe('enum')
    expect(kindOf(node({ enumValues: [] }))).toBe('string')
    expect(kindOf(node({ type: 'array' }))).toBe('array')
    expect(kindOf(node({ type: 'null' }))).toBe('unknown')
    expect(kindOf(undefined)).toBe('unknown')
  })
})

describe('widgetOutcome', () => {
  it.each([
    ['text', 'string', 'default'],
    ['updown', 'number', 'default'],
    ['text', 'number', 'default'],
    ['select', 'enum', 'default'],
    ['checkbox', 'boolean', 'default'],
    ['select', 'array', 'default'],
    ['textarea', 'string', 'textarea'],
    ['textarea', 'number', 'component'],
    ['textarea', 'boolean', 'component'],
    ['hidden', 'object', 'hidden'],
    ['hidden', 'string', 'hidden'],
    ['anything', 'object', 'ignored'],
    ['password', 'string', 'component'],
    ['radio', 'enum', 'component'],
    ['checkboxes', 'array', 'component'],
    ['text', 'enum', 'component'],
    ['textarea', 'unknown', 'textarea'],
    ['select', 'unknown', 'default'],
  ] as const)('%s on %s is %s', (name, kind, outcome) => {
    expect(widgetOutcome(name, kind)).toBe(outcome)
  })

  it('gives a textarea to a string enum and not to a number enum', () => {
    expect(widgetOutcome('textarea', 'enum', node({ enumValues: [{ value: 'a' }] }))).toBe('textarea')
    expect(widgetOutcome('textarea', 'enum', node({ type: 'number', enumValues: [{ value: 1 }] }))).toBe('component')
  })

  it('treats as default only names RJSF resolves through its stock type map', () => {
    const stubs = Object.fromEntries(
      ['TextWidget', 'UpDownWidget', 'SelectWidget', 'CheckboxWidget', 'TextareaWidget'].map((name) => [name, () => null]),
    )
    const accepted: [string, object][] = [
      ['text', { type: 'string' }],
      ['updown', { type: 'number' }],
      ['text', { type: 'number' }],
      ['select', { type: 'string', enum: ['a'] }],
      ['checkbox', { type: 'boolean' }],
      ['select', { type: 'array', items: { type: 'string', enum: ['a'] } }],
      ['textarea', { type: 'string' }],
    ]
    for (const [name, schema] of accepted) {
      expect(() => getWidget(schema as never, name, stubs as never)).not.toThrow()
    }
    expect(() => getWidget({ type: 'number' } as never, 'textarea', stubs as never)).toThrow()
  })
})

describe('dispose', () => {
  it('maps text keys by node kind', () => {
    expect(dispose('placeholder', 'x', context('string'))).toEqual({ kind: 'hint', hint: 'placeholder' })
    expect(dispose('placeholder', 'x', context('boolean'))).toEqual({ kind: 'none' })
    expect(dispose('placeholder', 'x', context('enum'))).toMatchObject({ kind: 'issue', code: 'unsupported' })
    expect(dispose('placeholder', 3, context('string'))).toMatchObject({ kind: 'issue', code: 'invalid-value' })
    expect(dispose('placeholder', 3, context('boolean'))).toEqual({ kind: 'none' })
    expect(dispose('description', 'x', context('object'))).toMatchObject({ kind: 'issue', code: 'unsupported' })
    expect(dispose('help', 'x', context('string', { node: node({ annotations: { description: 'd' } }) }))).toMatchObject({
      kind: 'issue',
      code: 'conflict',
    })
    expect(dispose('help', 'x', context('number'))).toEqual({ kind: 'hint', hint: 'helpText' })
  })

  it('reports only values that change what RJSF renders', () => {
    expect(dispose('label', true, context('string'))).toEqual({ kind: 'none' })
    expect(dispose('label', false, context('string'))).toMatchObject({ code: 'unsupported' })
    expect(dispose('readonly', true, context('string', { readOnly: true }))).toEqual({ kind: 'none' })
    expect(dispose('title', 'T', context('string', { node: node({ annotations: { title: 'T' } }) }))).toEqual({ kind: 'none' })
    expect(dispose('rows', 3, context('string'))).toEqual({ kind: 'none' })
    const textarea = new Map([['widget', { value: 'textarea', path: '/ui:widget' }]])
    expect(dispose('rows', 3, context('string', { options: textarea }))).toMatchObject({ code: 'unsupported' })
    expect(dispose('submitButtonOptions', {}, context('object'))).toEqual({ kind: 'none' })
    expect(dispose('submitButtonOptions', {}, context('object', { root: true }))).toMatchObject({ code: 'unsupported' })
    expect(dispose('FieldTemplate', 'x', context('string'))).toMatchObject({ code: 'unsupported' })
    expect(dispose('whatever', 1, context('string'))).toEqual({ kind: 'none' })
  })
})

describe('isInert', () => {
  it('holds only for keys and values that do nothing at any kind', () => {
    expect(['inline', 'accept', 'expandable', 'custom'].every((name) => isInert(name, true))).toBe(true)
    expect(isInert('widget', 'text')).toBe(false)
    expect(isInert('widget', 'textarea')).toBe(false)
    expect(isInert('orderable', false)).toBe(true)
    expect(isInert('orderable', true)).toBe(false)
    expect(isInert('addable', false)).toBe(false)
    expect(isInert('ObjectFieldTemplate', 'x')).toBe(false)
    expect(isInert('placeholder', 'x')).toBe(false)
  })
})

describe('convertOrder', () => {
  const children = ['a', 'b', 'c'].map((key) => ({ pointer: `/${key}` as JsonPointer, key, required: false }))

  it('places names before * below every schema position and names after it above', () => {
    const { orders, issues } = convertOrder(['c', '*', 'a'], children, '/ui:order')
    expect([...orders]).toEqual([
      ['/c', -1],
      ['/a', AFTER_WILDCARD],
    ])
    expect(issues).toEqual([])
  })

  it('orders a complete list without *', () => {
    expect([...convertOrder(['b', 'c', 'a'], children, '/o').orders]).toEqual([
      ['/b', -3],
      ['/c', -2],
      ['/a', -1],
    ])
  })

  it('reports unknown, duplicate and non-string entries by position', () => {
    const { orders, issues } = convertOrder(['x', 'a', 'a', 5, '*'], children, '/o')
    expect([...orders]).toEqual([['/a', -1]])
    expect(issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['unknown-location', '/o/0'],
      ['unsupported', '/o/2'],
      ['invalid-value', '/o/3'],
    ])
  })

  it('writes nothing where RJSF renders a configuration error', () => {
    for (const order of [['a', 'b'], ['*', 'a', '*'], 'a']) {
      const result = convertOrder(order, children, '/o')
      expect(result.orders.size).toBe(0)
      expect(result.issues.at(-1)?.code).toBe('invalid-value')
    }
  })
})
