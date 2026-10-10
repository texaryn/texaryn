import { describe, expect, it } from 'vitest'
import {
  escapeSegment,
  instancePointerFromUri,
  keywordNameFromId,
  resolveJsonPointer,
  schemaFragment,
  schemaAtPosition,
  schemaParentPosition,
  schemaPositionSegments,
  schemaReferenceTarget,
  schemaPosition,
  setSchemaDocumentContext,
} from '../pointer-utils.js'

describe('schema position helpers', () => {
  it('joins nested resource pointers without inserting an empty segment', () => {
    const root = {}
    const profileUri = 'https://forms.example.test/profile.json'
    const nestedUri = 'https://forms.example.test/nested.json'
    const remote = {
      $id: profileUri,
      $defs: {
        nested: {
          $id: nestedUri,
          properties: { label: { type: 'string' } },
        },
      },
    }
    setSchemaDocumentContext(
      root,
      [remote],
      new Map(),
      new Map([[nestedUri, `${profileUri}#/$defs/nested`]]),
    )

    expect(schemaAtPosition(root, `${nestedUri}#/properties/label`)).toEqual({ type: 'string' })
  })

  it('decodes URI fragment escapes while retaining the resource identifier', () => {
    expect(schemaPosition(
      'https://forms.example.test/profile.json#/properties/%C3%A9/if',
      'https://forms.example.test/root.json',
    )).toBe('https://forms.example.test/profile.json#/properties/é/if')
    expect(schemaPosition('#/properties/%C3%A9/if', 'https://forms.example.test/root.json'))
      .toBe('#/properties/é/if')
  })

  it('resolves an own __proto__ property as ordinary schema data', () => {
    const document = JSON.parse('{"__proto__":{"type":"string"}}') as Record<string, unknown>
    expect(schemaAtPosition(document, '#/__proto__')).toEqual({ type: 'string' })
  })

  it('normalizes empty, root, and malformed URI fragments', () => {
    expect(schemaFragment('https://forms.example.test/profile.json')).toBe('')
    expect(schemaFragment('https://forms.example.test/profile.json#/%ZZ')).toBe('/%ZZ')
    expect(schemaPosition('https://forms.example.test/root.json#/properties/name', 'https://forms.example.test/root.json'))
      .toBe('#/properties/name')
    expect(schemaPosition('https://forms.example.test/profile.json')).toBe('https://forms.example.test/profile.json#')
    expect(schemaPosition('https://forms.example.test/profile.json#/%ZZ')).toBe('https://forms.example.test/profile.json#/%ZZ')
    expect(schemaPosition('#/properties/name')).toBe('#/properties/name')
  })

  it('looks up direct documents, mapped embedded resources, and local positions', () => {
    const rootUri = 'https://forms.example.test/root.json'
    const profileUri = 'https://forms.example.test/profile.json'
    const nestedUri = 'https://forms.example.test/nested.json'
    const root = { properties: { local: { type: 'number' } } }
    const profile = {
      $id: `${profileUri}#discarded`,
      properties: { label: { type: 'string' } },
      $defs: { nested: { properties: { label: { type: 'string' } } } },
    }
    setSchemaDocumentContext(
      root,
      [null, true, [], { $id: 7 }, profile],
      new Map(),
      new Map([
        [nestedUri, `${profileUri}#/$defs/nested`],
        ['https://forms.example.test/outer.json', profileUri],
      ]),
    )

    expect(schemaAtPosition(root, `${profileUri}#/properties/label`)).toEqual({ type: 'string' })
    expect(schemaAtPosition(root, `${nestedUri}#/properties/label`)).toEqual({ type: 'string' })
    expect(schemaAtPosition(root, 'https://forms.example.test/outer.json#/properties/label')).toEqual({ type: 'string' })
    expect(schemaAtPosition(root, '#/properties/local')).toEqual({ type: 'number' })
    expect(schemaAtPosition(root, `${rootUri}#/missing`)).toBeUndefined()
  })

  it('resolves cached and authored local reference targets', () => {
    const root = {
      properties: { value: { $ref: '#/$defs/target' } },
      $defs: { target: { type: 'string' } },
    }
    const position = '#/properties/value'
    setSchemaDocumentContext(root, [], new Map([[`${position}\u0000$ref`, '#/cached']]), new Map())
    expect(schemaReferenceTarget(root, position)).toBe('#/cached')

    const authored = { properties: { value: { $ref: '#/$defs/target' } }, $defs: { target: { type: 'string' } } }
    expect(schemaReferenceTarget(authored, position)).toBe('#/$defs/target')
    expect(schemaReferenceTarget(authored, '#/missing')).toBeUndefined()
  })

  it('formats schema and instance pointers', () => {
    expect(schemaPositionSegments('properties/a~1b~0c')).toEqual(['properties', 'a/b~c'])
    expect(schemaPositionSegments('/properties/name')).toEqual(['properties', 'name'])
    expect(schemaPositionSegments('#')).toEqual([])
    expect(schemaParentPosition('properties/a/b', 2)).toBe('#/properties/a')
    expect(schemaParentPosition('#/properties/a/b', 0)).toBe('#')
    expect(schemaParentPosition('properties/a/b', 1)).toBe('#/properties')
    expect(schemaParentPosition('https://forms.example.test/profile.json#/$defs/name', 1))
      .toBe('https://forms.example.test/profile.json#/$defs')
    expect(escapeSegment('a/b~c')).toBe('a~1b~0c')
    expect(instancePointerFromUri('https://forms.example.test/data.json')).toBe('')
    expect(instancePointerFromUri('https://forms.example.test/data.json#/items/0')).toBe('/items/0')
    expect(keywordNameFromId('https://json-schema.org/draft/2020-12/schema/properties')).toBe('properties')
  })

  it('resolves object and array pointers and stops at missing values', () => {
    const document = { items: [{ value: 1 }, null], own: { toString: 'data' } }
    expect(resolveJsonPointer(document, '')).toBe(document)
    expect(resolveJsonPointer(document, '/items/0/value')).toBe(1)
    expect(resolveJsonPointer(document, '/own/toString')).toBe('data')
    expect(resolveJsonPointer(document, '/items/2')).toBeUndefined()
    expect(resolveJsonPointer(document, '/items/1/value')).toBeUndefined()
    expect(resolveJsonPointer(document, '/missing')).toBeUndefined()
  })
})
