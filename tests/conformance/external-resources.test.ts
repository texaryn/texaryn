import { describe, expect, it } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'
import type { JsonPointer } from '@texaryn/core'

const rootUri = 'https://forms.example.test/root.json'
const profileUri = 'https://forms.example.test/profile.json'
const resourceSchema = {
  type: 'object',
  properties: {
    profile: { $ref: './profile.json' },
  },
}

const adapters = [
  ['json-schema-library', createJsonSchemaAdapter],
  ['@hyperjump/json-schema', createHyperjumpAdapter],
] as const

for (const [name, createAdapter] of adapters) {
  describe(`${name} external schema resources`, () => {
    it('resolves, validates, and projects a retrieved document without network access', async () => {
      const calls: string[] = []
      const adapter = await createAdapter(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, ...resourceSchema },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            if (uri !== profileUri) return undefined
            return {
              type: 'object',
              properties: {
                name: { type: 'string', default: 'Ada' },
              },
              required: ['name'],
            }
          },
        },
      )

      expect(calls).toEqual([profileUri])
      expect((await adapter.validate({ profile: {} })).valid).toBe(false)
      expect((await adapter.validate({ profile: { name: 'Ada' } })).valid).toBe(true)
      const projection = adapter.project({})
      expect(projection.nodes.get('/profile' as JsonPointer)?.type).toBe('object')
      expect(projection.nodes.get('/profile/name' as JsonPointer)?.type).toBe('string')
      expect(projection.nodes.get('/profile/name' as JsonPointer)?.annotations.default).toBe('Ada')
    })

    it('loads mutually referring resources once and keeps resource positions distinct', async () => {
      const aUri = 'https://forms.example.test/a.json'
      const bUri = 'https://forms.example.test/b.json'
      const calls: string[] = []
      const documents: Record<string, unknown> = {
        [aUri]: {
          $id: aUri,
          type: 'object',
          properties: { b: { $ref: bUri } },
        },
        [bUri]: {
          $id: bUri,
          type: 'object',
          properties: { a: { $ref: aUri } },
        },
      }
      const adapter = await createAdapter(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: aUri },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return documents[uri]
          },
        },
      )

      expect(calls).toEqual([aUri, bUri])
      expect(adapter.project({}).nodes.has('/b/a' as JsonPointer)).toBe(true)
    })

    it('passes a fragment to the schema engine after fetching the containing document', async () => {
      const calls: string[] = []
      const adapter = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: { code: { $ref: `${profileUri}#/$defs/code` } },
        },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return {
              $id: profileUri,
              $defs: { code: { type: 'string', minLength: 3 } },
            }
          },
        },
      )

      expect(calls).toEqual([profileUri])
      expect(adapter.project({}).nodes.get('/code' as JsonPointer)?.constraints.minLength).toBe(3)
      expect((await adapter.validate({ code: 'ok' })).valid).toBe(false)
    })

    it('follows a local pointer into a custom container while discovering external references', async () => {
      const calls: string[] = []
      const adapter = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: { profile: { $ref: '#/x-defs/Profile' } },
          'x-defs': { Profile: { $ref: './profile.json' } },
        },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return uri === profileUri ? { type: 'string' } : undefined
          },
        },
      )

      expect(calls).toEqual([profileUri])
      expect((await adapter.validate({ profile: 'Ada' })).valid).toBe(true)
      expect((await adapter.validate({ profile: 7 })).valid).toBe(false)
      expect(adapter.project({}).nodes.get('/profile' as JsonPointer)?.type).toBe('string')
    })

    it('reuses a local pointer alias when several properties target one custom container schema', async () => {
      const adapter = await createAdapter({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: rootUri,
        properties: {
          primary: { $ref: '#/x-defs/Profile' },
          secondary: { $ref: '#/x-defs/Profile' },
        },
        'x-defs': {
          Profile: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      })

      expect((await adapter.validate({
        primary: { name: 'Ada' },
        secondary: { name: 'Grace' },
      })).valid).toBe(true)
      expect((await adapter.validate({
        primary: { name: 'Ada' },
        secondary: { name: 7 },
      })).valid).toBe(false)
      expect(adapter.project({}).nodes.get('/primary/name' as JsonPointer)?.type).toBe('string')
      expect(adapter.project({}).nodes.get('/secondary/name' as JsonPointer)?.type).toBe('string')
    })

    it('rewrites pointers to descendants through an existing custom container alias', async () => {
      const adapter = await createAdapter({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: rootUri,
        properties: {
          profile: { $ref: '#/x-defs/Profile' },
          name: { $ref: '#/x-defs/Profile/properties/name' },
        },
        'x-defs': {
          Profile: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      })

      expect((await adapter.validate({
        profile: { name: 'Ada' },
        name: 'Grace',
      })).valid).toBe(true)
      expect((await adapter.validate({
        profile: { name: 'Ada' },
        name: 7,
      })).valid).toBe(false)
      expect(adapter.project({}).nodes.get('/profile/name' as JsonPointer)?.type).toBe('string')
      expect(adapter.project({}).nodes.get('/name' as JsonPointer)?.type).toBe('string')
    })

    it('indexes custom container descendants inside a copied embedded resource', async () => {
      const adapter = await createAdapter({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: rootUri,
        properties: { profile: { $ref: '#/x-defs/inner/x-defs/Profile' } },
        'x-defs': {
          inner: {
            $id: 'sub/',
            'x-defs': {
              Profile: {
                type: 'object',
                properties: { name: { type: 'string' } },
              },
            },
          },
        },
      })

      expect((await adapter.validate({ profile: { name: 'Ada' } })).valid).toBe(true)
      expect((await adapter.validate({ profile: { name: 7 } })).valid).toBe(false)
      expect(adapter.project({}).nodes.get('/profile/name' as JsonPointer)?.type).toBe('string')
    })

    it('ignores a Draft 7 $id sibling while materializing a custom-container pointer', async () => {
      const calls: string[] = []
      const adapter = await createAdapter(
        {
          $schema: 'http://json-schema.org/draft-07/schema#',
          $id: rootUri,
          properties: { profile: { $ref: '#/x-defs/Profile' } },
          'x-defs': {
            Profile: {
              $ref: './profile.json',
              $id: 'https://ignored.example.test/schema.json',
            },
          },
        },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return uri === profileUri ? { type: 'string' } : undefined
          },
        },
      )

      expect(calls).toEqual([profileUri])
      expect((await adapter.validate({ profile: 'Ada' })).valid).toBe(true)
      expect((await adapter.validate({ profile: 7 })).valid).toBe(false)
      expect(adapter.project({}).nodes.get('/profile' as JsonPointer)?.type).toBe('string')
    })

    it('recognizes an embedded resource ID reached through a custom-container pointer', async () => {
      const nestedUri = 'https://forms.example.test/custom-profile.json'
      const calls: string[] = []
      const adapter = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: {
            profile: { $ref: '#/x-defs/Profile' },
            alias: { $ref: nestedUri },
          },
          'x-defs': { Profile: { $id: nestedUri, type: 'string' } },
        },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return undefined
          },
        },
      )

      expect(calls).toEqual([])
      expect((await adapter.validate({ profile: 'Ada', alias: 'Grace' })).valid).toBe(true)
      expect(adapter.project({}).nodes.get('/profile' as JsonPointer)?.type).toBe('string')
      expect(adapter.project({}).nodes.get('/alias' as JsonPointer)?.type).toBe('string')
    })

    it('preserves const values while materializing local pointer aliases', async () => {
      const constValue = { $ref: '#/x-defs/Target' }
      const adapter = await createAdapter({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: rootUri,
        const: constValue,
        allOf: [{ $ref: '#/const' }],
        'x-defs': { Target: { type: 'object' } },
      })

      expect((await adapter.validate(constValue)).valid).toBe(true)
    })

    it('keeps the enclosing resource base when a pointer crosses a custom container', async () => {
      const nestedUri = 'https://forms.example.test/sub/'
      const nestedLeafUri = 'https://forms.example.test/sub/leaf.json'
      const calls: string[] = []
      const adapter = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: {
            whole: { $ref: nestedUri },
            profile: { $ref: '#/x-defs/inner/properties/value' },
          },
          'x-defs': {
            inner: {
              $id: 'sub/',
              properties: { value: { $ref: 'leaf.json' } },
            },
          },
        },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return uri === nestedLeafUri ? { type: 'string' } : undefined
          },
        },
      )

      expect(calls).toEqual([nestedLeafUri])
      expect((await adapter.validate({ whole: { value: 'Ada' }, profile: 'Grace' })).valid).toBe(true)
      expect((await adapter.validate({ whole: { value: 7 }, profile: 'Grace' })).valid).toBe(false)
      expect(adapter.project({}).nodes.get('/whole/value' as JsonPointer)?.type).toBe('string')
      expect(adapter.project({}).nodes.get('/profile' as JsonPointer)?.type).toBe('string')
    })

    it('keeps an indexed embedded resource ID on its enclosing schema', async () => {
      const nestedUri = 'https://forms.example.test/indexed-profile.json'
      const adapter = await createAdapter({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: rootUri,
        properties: {
          whole: { $ref: nestedUri },
          alias: { $ref: '#/$defs/profile/x-defs/value' },
        },
        $defs: {
          profile: {
            $id: nestedUri,
            type: 'object',
            'x-defs': { value: { type: 'string' } },
          },
        },
      })

      expect((await adapter.validate({ whole: {}, alias: 'Ada' })).valid).toBe(true)
      expect((await adapter.validate({ whole: {}, alias: 7 })).valid).toBe(false)
      expect(adapter.project({}).nodes.get('/whole' as JsonPointer)?.type).toBe('object')
      expect(adapter.project({}).nodes.get('/alias' as JsonPointer)?.type).toBe('string')
    })

    it('rejects a mismatched dialect on a resource reached through a custom container', async () => {
      const nestedUri = 'https://forms.example.test/custom-legacy.json'
      await expect(createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: { profile: { $ref: '#/x-defs/Legacy' } },
          'x-defs': {
            Legacy: {
              $id: nestedUri,
              $schema: 'http://json-schema.org/draft-07/schema#',
              type: 'string',
            },
          },
        },
      )).rejects.toMatchObject({
        name: 'SchemaResourceResolutionError',
        uri: nestedUri,
        referringPosition: '#/x-defs/Legacy',
      })
    })

    it('preserves fragment-only Draft 7 identifiers as anchors in retrieved resources', async () => {
      const adapter = await createAdapter(
        {
          $schema: 'http://json-schema.org/draft-07/schema#',
          $id: rootUri,
          properties: { profile: { $ref: profileUri } },
        },
        {
          resolveResource: () => ({
            $id: profileUri,
            definitions: { named: { $id: '#name', type: 'string' } },
            properties: { code: { $ref: '#name' } },
          }),
        },
      )

      expect((await adapter.validate({ profile: { code: 'TX-1' } })).valid).toBe(true)
      expect((await adapter.validate({ profile: { code: 7 } })).valid).toBe(false)
      expect(adapter.project({}).nodes.get('/profile/code' as JsonPointer)?.type).toBe('string')
    })

    it('resolves an external dynamic reference and its nested dynamic references', async () => {
      const calls: string[] = []
      const adapter = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: { profile: { $dynamicRef: `${profileUri}#node` } },
        },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return {
              $id: profileUri,
              $dynamicAnchor: 'node',
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                child: { $dynamicRef: '#node' },
              },
            }
          },
        },
      )

      expect(calls).toEqual([profileUri])
      expect((await adapter.validate({ profile: { name: 'Ada', child: { name: 'Grace' } } })).valid).toBe(true)
    })

    it('preserves __proto__ as an own JSON property in a retrieved schema', async () => {
      const expected = JSON.parse('{"__proto__":1}') as Record<string, unknown>
      const adapter = await createAdapter(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: profileUri },
        { resolveResource: () => ({ const: expected }) },
      )

      expect((await adapter.validate({})).valid).toBe(false)
      expect((await adapter.validate(JSON.parse('{"__proto__":1}'))).valid).toBe(true)
    })

    it('does not resolve schema locations in dialect ignored keywords', async () => {
      const ignoredUri = 'https://forms.example.test/ignored-prefix.json'
      const calls: string[] = []
      const adapter = await createAdapter(
        {
          $schema: 'http://json-schema.org/draft-07/schema#',
          $id: rootUri,
          type: 'string',
          prefixItems: [{ $ref: ignoredUri }],
        },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return undefined
          },
        },
      )

      expect(calls).toEqual([])
      expect((await adapter.validate('value')).valid).toBe(true)
    })

    it('does not treat every URI under the JSON Schema domain as a built in metaschema', async () => {
      const customUri = 'https://json-schema.org/draft/2020-12/not-a-metaschema'
      const calls: string[] = []
      const adapter = await createAdapter(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: customUri },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return { type: 'string' }
          },
        },
      )

      expect(calls).toEqual([customUri])
      expect((await adapter.validate('value')).valid).toBe(true)
    })

    it('supports a retrieved document whose canonical $id differs from its retrieval URI', async () => {
      const canonicalUri = 'https://schemas.example.test/profile.json'
      const supplied = {
        $id: canonicalUri,
        $defs: { code: { type: 'string', minLength: 3 } },
      }
      const adapter = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: { code: { $ref: `${profileUri}#/$defs/code` } },
        },
        { resolveResource: () => supplied },
      )

      expect(supplied).toEqual({
        $id: canonicalUri,
        $defs: { code: { type: 'string', minLength: 3 } },
      })
      expect(adapter.project({}).nodes.get('/code' as JsonPointer)?.constraints.minLength).toBe(3)
      expect((await adapter.validate({ code: 'ok' })).valid).toBe(false)
    })

    it('accepts the same canonical resource through multiple retrieval URIs', async () => {
      const aliasUri = 'https://forms.example.test/profile-alias.json'
      const canonicalUri = 'https://schemas.example.test/profile.json'
      const adapter = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: {
            profile: { $ref: profileUri },
            alias: { $ref: aliasUri },
          },
        },
        {
          resolveResource: (uri) => uri === profileUri
            ? {
                $id: canonicalUri,
                type: 'object',
                properties: { name: { type: 'string' } },
              }
            : {
                properties: { name: { type: 'string' } },
                $id: canonicalUri,
                type: 'object',
              },
        },
      )

      expect((await adapter.validate({
        profile: { name: 'Ada' },
        alias: { name: 'Grace' },
      })).valid).toBe(true)
      expect(adapter.project({}).nodes.get('/profile/name' as JsonPointer)?.type).toBe('string')
      expect(adapter.project({}).nodes.get('/alias/name' as JsonPointer)?.type).toBe('string')
    })

    it('resolves nested resource identifiers from the retrieved document without another resolver call', async () => {
      const nestedUri = 'https://forms.example.test/nested.json'
      const calls: string[] = []
      const adapter = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: { profile: { $ref: profileUri } },
        },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return {
              $id: profileUri,
              $defs: {
                nested: {
                  $id: nestedUri,
                  type: 'object',
                  properties: { label: { type: 'string' } },
                },
              },
              properties: { nested: { $ref: nestedUri } },
            }
          },
        },
      )

      expect(calls).toEqual([profileUri])
      expect(adapter.project({}).nodes.get('/profile/nested/label' as JsonPointer)?.type).toBe('string')
    })

    it('rejects resources that declare a different JSON Schema dialect', async () => {
      await expect(
        createAdapter(
          { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: profileUri },
          {
            resolveResource: () => ({
              $schema: 'http://json-schema.org/draft-07/schema#',
              type: 'string',
            }),
          },
        ),
      ).rejects.toMatchObject({
        name: 'SchemaResourceResolutionError',
        uri: profileUri,
      })
    })

    it('rejects an embedded resource that declares a different JSON Schema dialect', async () => {
      const nestedUri = 'https://forms.example.test/legacy.json'
      await expect(
        createAdapter(
          { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: profileUri },
          {
            resolveResource: () => ({
              $id: profileUri,
              $defs: {
                legacy: {
                  $id: nestedUri,
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  type: 'string',
                },
              },
            }),
          },
        ),
      ).rejects.toMatchObject({
        name: 'SchemaResourceResolutionError',
        uri: nestedUri,
        referringPosition: '#/$defs/legacy',
      })
    })

    it('keeps externally referenced schemas inside otherwise unreachable conditional branches', async () => {
      const adapter = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: { profile: { $ref: `${profileUri}#/then` } },
        },
        {
          resolveResource: () => ({
            $id: profileUri,
            if: false,
            then: {
              type: 'object',
              properties: { label: { type: 'string' } },
            },
          }),
        },
      )

      expect(adapter.project({}).nodes.get('/profile/label' as JsonPointer)?.type).toBe('string')
      expect((await adapter.validate({ profile: { label: 1 } })).valid).toBe(false)
    })

    it('does not resolve Draft 7 references in ignored $ref siblings', async () => {
      const missingUri = 'https://forms.example.test/ignored.json'
      const calls: string[] = []
      const adapter = await createAdapter(
        {
          $schema: 'http://json-schema.org/draft-07/schema#',
          $id: rootUri,
          $ref: profileUri,
          properties: { ignored: { $ref: missingUri } },
        },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return uri === profileUri ? { type: 'string' } : undefined
          },
        },
      )

      expect(calls).toEqual([profileUri])
      expect((await adapter.validate('value')).valid).toBe(true)
    })

    it('resolves a Draft 7 reference against its parent when its $id sibling is ignored', async () => {
      const calls: string[] = []
      const result = await createAdapter(
        {
          $schema: 'http://json-schema.org/draft-07/schema#',
          $id: rootUri,
          properties: {
            code: { $ref: './profile.json', $id: 'https://ignored.example.test/schema.json' },
          },
        },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return undefined
          },
        },
      ).catch((error: unknown) => error)

      expect(calls).toEqual([profileUri])
      expect(result).toMatchObject({
        name: 'SchemaResourceResolutionError',
        uri: profileUri,
        referringPosition: '#/properties/code/$ref',
      })
    })

    it('accepts boolean resource documents and evaluates them as schemas', async () => {
      const falseUri = 'https://forms.example.test/false.json'
      const adapter = await createAdapter(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: falseUri },
        { resolveResource: () => false },
      )

      expect((await adapter.validate({})).valid).toBe(false)
    })

    it('fails adapter creation when a configured resolver cannot supply a resource', async () => {
      const result = await createAdapter(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: profileUri },
        { resolveResource: () => undefined },
      ).catch((error: unknown) => error)

      expect(result).toMatchObject({
        name: 'SchemaResourceResolutionError',
        uri: profileUri,
        referringPosition: '#/$ref',
      })
    })

    it('stops before resolving a resource beyond the configured limit', async () => {
      const secondUri = 'https://forms.example.test/second.json'
      const calls: string[] = []
      const result = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          allOf: [{ $ref: profileUri }, { $ref: secondUri }],
        },
        {
          maxExternalResources: 1,
          resolveResource: (uri) => {
            calls.push(uri)
            return { type: 'string' }
          },
        },
      ).catch((error: unknown) => error)

      expect(result).toMatchObject({
        name: 'SchemaResourceResolutionError',
        uri: secondUri,
        referringPosition: '#/allOf/1/$ref',
      })
      expect(calls).toEqual([profileUri])
    })

    it('rejects file resources before calling the resolver', async () => {
      const calls: string[] = []
      const resolver = (uri: string) => { calls.push(uri); return { $id: uri, type: 'string' } }
      await expect(
        createAdapter(
          { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: 'file:///tmp/schema.json' },
          { resolveResource: resolver },
        ),
      ).rejects.toMatchObject({ name: 'SchemaResourceResolutionError', uri: 'file:///tmp/schema.json' })
      expect(calls).toEqual([])
    })
  })
}

it('keeps Hyperjump resource context isolated when an input schema is reused', async () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: rootUri,
    properties: { profile: { $ref: profileUri } },
  }
  const first = await createHyperjumpAdapter(schema, {
    resolveResource: () => ({
      type: 'object',
      properties: { name: { type: 'string' } },
    }),
  })
  const second = await createHyperjumpAdapter(schema, {
    resolveResource: () => ({
      type: 'object',
      properties: { name: { type: 'number' } },
    }),
  })

  expect(first.project({}).nodes.get('/profile/name' as JsonPointer)?.type).toBe('string')
  expect(second.project({}).nodes.get('/profile/name' as JsonPointer)?.type).toBe('number')
})

it.each([
  ['root identifier', { $id: 'file:///tmp/root.json', type: 'string' }],
  ['nested identifier', { type: 'object', properties: { child: { $id: 'file:///tmp/child.json', type: 'string' } } }],
])('preserves Hyperjump file URI refusal for a %s', async (_label, schema) => {
  await expect(createHyperjumpAdapter(schema)).rejects.toThrow('file: scheme')
})
