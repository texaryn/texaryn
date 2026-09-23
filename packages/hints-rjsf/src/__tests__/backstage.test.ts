import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { extractSchemaFromStep } from '../../../../spikes/backstage-adoption/src/backstage/extract-schema.js'
import { splitBackstageStep } from '../index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const steps = JSON.parse(readFileSync(join(__dirname, './fixtures/kitchen-sink.json'), 'utf8')) as Record<string, unknown>[]

describe('splitBackstageStep', () => {
  it.each(steps.map((step, index) => [index, step] as const))('matches Backstage extraction for step %i', (_index, step) => {
    const expected = extractSchemaFromStep(structuredClone(step))
    const split = splitBackstageStep(step)
    expect(split.schema).toEqual(expected.schema)
    expect(split.uiSchema).toEqual(expected.uiSchema)
    expect(split.issues).toEqual([])
  })

  it('moves ui keys out of properties, items and every branch, and records where each was written', () => {
    const step = {
      properties: {
        name: { type: 'string', 'ui:autofocus': true },
        list: { type: 'array', items: { type: 'string', 'ui:placeholder': 'item' } },
      },
      dependencies: {
        name: { allOf: [{ if: { properties: { name: { const: 'x' } } }, then: { properties: { extra: { type: 'string', 'ui:help': 'more' } } } }] },
      },
      oneOf: [{ properties: { name: { 'ui:title': 'Name' } } }],
    }
    const split = splitBackstageStep(step)
    expect(split.uiSchema).toEqual({
      name: { 'ui:autofocus': true, 'ui:title': 'Name' },
      list: { items: { 'ui:placeholder': 'item' } },
      extra: { 'ui:help': 'more' },
    })
    expect(split.schema).toEqual({
      properties: { name: { type: 'string' }, list: { type: 'array', items: { type: 'string' } } },
      dependencies: { name: { allOf: [{ if: { properties: { name: { const: 'x' } } }, then: { properties: { extra: { type: 'string' } } } }] } },
      oneOf: [{ properties: { name: {} } }],
    })
    expect([...split.sources]).toEqual([
      ['/name/ui:autofocus', ['/properties/name/ui:autofocus']],
      ['/list/items/ui:placeholder', ['/properties/list/items/ui:placeholder']],
      ['/name/ui:title', ['/oneOf/0/properties/name/ui:title']],
      ['/extra/ui:help', ['/dependencies/name/allOf/0/then/properties/extra/ui:help']],
    ])
    expect(step.properties.name['ui:autofocus']).toBe(true)
  })

  it('lifts schema-level enumNames so the conversion reports it', () => {
    const split = splitBackstageStep({ properties: { size: { type: 'string', enum: ['s', 'l'], enumNames: ['Small', 'Large'] } } })
    expect(split.uiSchema).toEqual({ size: { 'ui:enumNames': ['Small', 'Large'] } })
    expect(split.schema).toEqual({ properties: { size: { type: 'string', enum: ['s', 'l'] } } })
    expect(split.sources.get('/size/ui:enumNames')).toEqual(['/properties/size/enumNames'])
  })

  it('reports branches that write different values to one key and keeps the last, as Backstage does', () => {
    const split = splitBackstageStep({
      properties: { mode: { type: 'string' } },
      oneOf: [
        { properties: { mode: { 'ui:widget': 'radio' } } },
        { properties: { mode: { 'ui:widget': 'select' } } },
        { properties: { mode: { 'ui:widget': 'select' } } },
      ],
    })
    expect(split.uiSchema).toEqual({ mode: { 'ui:widget': 'select' } })
    expect(split.issues.map((issue) => [issue.code, issue.path, issue.value])).toEqual([['conditional', '/mode/ui:widget', 'select']])
    expect(split.sources.get('/mode/ui:widget')).toEqual([
      '/oneOf/0/properties/mode/ui:widget',
      '/oneOf/1/properties/mode/ui:widget',
      '/oneOf/2/properties/mode/ui:widget',
    ])
  })

  it('never throws, and reports what is outside JSON', () => {
    const inputs: unknown[] = [undefined, 42, 'x', [], () => 1, { properties: { a: { 'ui:widget': () => null } } }]
    for (const input of inputs) expect(() => splitBackstageStep(input)).not.toThrow()
    expect(splitBackstageStep(42).issues.map((issue) => [issue.code, issue.path])).toEqual([['invalid-value', '']])
    expect(splitBackstageStep({ properties: { a: { 'ui:widget': () => null } } }).issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['invalid-value', '/properties/a/ui:widget'],
    ])
  })
})
