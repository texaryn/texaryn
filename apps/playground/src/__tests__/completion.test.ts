import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import type { CompletionResult } from '@codemirror/autocomplete'
import { ensureSyntaxTree } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { schemaCompletionSource } from '../editor/completion.js'
import { dialectOf } from '../editor/keywords.js'

function complete(doc: string, pos = doc.length): CompletionResult | null {
  const state = EditorState.create({ doc, extensions: [json()] })
  ensureSyntaxTree(state, state.doc.length, 1000)
  return schemaCompletionSource(new CompletionContext(state, pos, false))
}

function labels(result: CompletionResult | null): string[] {
  return (result?.options ?? []).map((option) => option.displayLabel ?? option.label)
}

describe('schemaCompletionSource', () => {
  it('offers draft 7 keywords when no $schema is declared', () => {
    const names = labels(complete('{\n  "type": "object",\n  "max'))
    expect(names).toContain('maxLength')
    expect(names).not.toContain('prefixItems')
  })

  it('follows the declared dialect', () => {
    const names = labels(complete('{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "pre'))
    expect(names).toContain('prefixItems')
    expect(names).toContain('$defs')
    expect(names).not.toContain('definitions')
  })

  it('offers nothing where keys are property names', () => {
    expect(complete('{\n  "properties": {\n    "na')).toBeNull()
  })

  it('offers type names as values of type', () => {
    expect(labels(complete('{ "type": "str'))).toContain('string')
  })

  it('replaces an auto-closed quote', () => {
    const doc = '{ "max" }'
    const result = complete(doc, doc.indexOf('"max') + 4)
    expect(result?.to).toBe(doc.indexOf('"max') + 5)
  })
})

describe('keyword positions follow the schema structure', () => {
  it.each([
    ['inside a required array', '{ "required": ["a", "b'],
    ['inside a default value', '{ "default": { "ty'],
    ['inside a const value', '{ "const": { "ty'],
    ['inside an object in enum', '{ "enum": [ { "ty'],
    ['inside examples data', '{ "examples": [ { "a": 1, "ty'],
    ['inside dependencies arrays', '{ "dependencies": { "a": [ "ty'],
    ['inside dependentRequired', '{ "dependentRequired": { "a": ["b"], "ty'],
    ['inside $vocabulary', '{ "$vocabulary": { "ty'],
    ['inside an unknown keyword value', '{ "x-extra": { "ty'],
    ['as property names', '{ "properties": { "a": {}, "ty'],
  ])('offers nothing %s', (_name, doc) => {
    expect(complete(doc)).toBeNull()
  })

  it.each([
    ['a property schema', '{ "properties": { "a": { "ty'],
    ['a schema named like a map keyword', '{ "properties": { "properties": { "ty'],
    ['an allOf element', '{ "allOf": [ {}, { "ty'],
    ['an items schema', '{ "items": { "ty'],
    ['a tuple items element', '{ "items": [ {}, { "ty'],
    ['a not schema', '{ "not": { "ty'],
    ['a dependencies schema', '{ "dependencies": { "a": { "ty'],
    ['a $defs schema', '{ "$defs": { "a": { "ty'],
    ['a second member', '{ "type": "object", "ty'],
  ])('offers keywords in %s', (_name, doc) => {
    expect(labels(complete(doc))).toContain('type')
  })

  it('offers type values inside a type array', () => {
    const names = labels(complete('{ "type": ["string", "'))
    expect(names).toContain('integer')
    expect(names).not.toContain('maxLength')
  })

  it('offers no values when a property is named like a value keyword', () => {
    expect(complete('{ "properties": { "type": "')).toBeNull()
    expect(complete('{ "properties": { "$schema": "')).toBeNull()
  })

  it('offers no values for keys that only exist on Object.prototype', () => {
    expect(complete('{ "constructor": "')).toBeNull()
  })

  it('offers values for format and $schema in a schema', () => {
    expect(labels(complete('{ "format": "'))).toContain('uuid')
    expect(labels(complete('{ "$schema": "'))).toContain('http://json-schema.org/draft-07/schema#')
  })

  it('offers type values in a nested schema', () => {
    expect(labels(complete('{ "properties": { "a": { "type": "'))).toContain('string')
  })
})

describe('dialect keyword tables', () => {
  const cases: [string, string, string, string][] = [
    ['draft-04', 'http://json-schema.org/draft-04/schema#', 'id', '$id'],
    ['draft-07', 'http://json-schema.org/draft-07/schema#', '$id', '$defs'],
    ['2019-09', 'https://json-schema.org/draft/2019-09/schema', '$defs', 'prefixItems'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema', 'prefixItems', 'additionalItems'],
  ]
  for (const [dialect, uri, offered, absent] of cases) {
    it(`${dialect} offers ${offered} and not ${absent}`, () => {
      const names = labels(complete(`{ "$schema": "${uri}", "`))
      expect(names).toContain(offered)
      expect(names).not.toContain(absent)
    })
  }
})

describe('dialectOf', () => {
  it('reads only the root $schema', () => {
    const doc = '{ "$defs": { "a": { "$schema": "https://json-schema.org/draft/2020-12/schema" } } }'
    expect(dialectOf(doc)).toBe('draft-07')
  })

  it('ignores a property named $schema inside properties', () => {
    expect(dialectOf('{ "properties": { "$schema": { "const": "2019-09" } } }')).toBe('draft-07')
  })

  it('prefers the root over a nested declaration', () => {
    const doc = '{ "$defs": { "a": { "$schema": "2020-12" } }, "$schema": "http://json-schema.org/draft-04/schema#" }'
    expect(dialectOf(doc)).toBe('draft-04')
  })

  it('matches in the adapter order', () => {
    expect(dialectOf('{ "$schema": "x/draft-04/2020-12" }')).toBe('draft-04')
    expect(dialectOf('{ "$schema": "x/draft-07/2019-09" }')).toBe('draft-07')
    expect(dialectOf('{ "$schema": "x/2019-09/2020-12" }')).toBe('2019-09')
  })

  it('reads a $schema string that is still being typed', () => {
    expect(dialectOf('{ "$schema": "https://json-schema.org/draft/2020-12/sch')).toBe('2020-12')
  })

  it('defaults to draft-07 for an unknown or missing $schema', () => {
    expect(dialectOf('{ "$schema": "https://example.com/custom" }')).toBe('draft-07')
    expect(dialectOf('{}')).toBe('draft-07')
    expect(dialectOf('')).toBe('draft-07')
  })
})
