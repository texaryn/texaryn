import { describe, expect, it } from 'vitest'
import {
  schemaAtPosition,
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
})
