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
                required: ['name'],
                type: 'object',
                properties: { name: { type: 'string' } },
              }
            : {
                properties: { name: { type: 'string' } },
                required: ['name'],
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

    it('discovers references in each 2020-12 schema container', async () => {
      const references = {
        property: 'https://forms.example.test/containers/property.json',
        patternProperty: 'https://forms.example.test/containers/pattern-property.json',
        additionalProperties: 'https://forms.example.test/containers/additional-properties.json',
        prefixItems: 'https://forms.example.test/containers/prefix-items.json',
        items: 'https://forms.example.test/containers/items.json',
        contains: 'https://forms.example.test/containers/contains.json',
        not: 'https://forms.example.test/containers/not.json',
        allOf: 'https://forms.example.test/containers/all-of.json',
        anyOf: 'https://forms.example.test/containers/any-of.json',
        oneOf: 'https://forms.example.test/containers/one-of.json',
        then: 'https://forms.example.test/containers/then.json',
        else: 'https://forms.example.test/containers/else.json',
        dependentSchema: 'https://forms.example.test/containers/dependent-schema.json',
        definition: 'https://forms.example.test/containers/definition.json',
      }
      const calls: string[] = []
      await expect(createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: { direct: { $ref: references.property } },
          patternProperties: { '^pattern': { $ref: references.patternProperty } },
          additionalProperties: { $ref: references.additionalProperties },
          prefixItems: [{ $ref: references.prefixItems }],
          items: { $ref: references.items },
          contains: { $ref: references.contains },
          not: { $ref: references.not },
          allOf: [{ $ref: references.allOf }],
          anyOf: [{ $ref: references.anyOf }],
          oneOf: [{ $ref: references.oneOf }],
          if: { properties: { flag: { const: true } } },
          then: { properties: { branch: { $ref: references.then } } },
          else: { properties: { fallback: { $ref: references.else } } },
          dependentSchemas: { enabled: { properties: { dependent: { $ref: references.dependentSchema } } } },
          $defs: { stored: { $ref: references.definition } },
        },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return { type: 'string' }
          },
        },
      )).resolves.toBeDefined()

      expect(calls).toHaveLength(Object.keys(references).length)
      expect([...calls].sort()).toEqual(Object.values(references).sort())
    })

    it('retrieves an absolute reference when the root has no identifier', async () => {
      const calls: string[] = []
      const adapter = await createAdapter(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', $ref: profileUri },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return { type: 'string' }
          },
        },
      )

      expect(calls).toEqual([profileUri])
      expect((await adapter.validate('value')).valid).toBe(true)
    })

    it('rejects malformed references inside a retrieved document', async () => {
      const result = await createAdapter(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: profileUri },
        { resolveResource: () => ({ properties: { broken: { $ref: 'http://[invalid' } } }) },
      ).catch((error: unknown) => error)

      expect(result).toMatchObject({
        name: 'SchemaResourceResolutionError',
        uri: profileUri,
        referringPosition: '#/properties/broken/$ref',
      })
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

    it('discovers nested references in ignored Draft 7 reference siblings', async () => {
      const nestedUri = 'https://forms.example.test/nested-profile.json'
      const siblingUri = 'https://forms.example.test/ignored-profile.json'
      const calls: string[] = []
      const adapter = await createAdapter(
        { $schema: 'http://json-schema.org/draft-07/schema#', $id: rootUri, properties: { profile: { $ref: profileUri } } },
        {
          defaultDialect: 'draft-07',
          resolveResource: (uri) => {
            calls.push(uri)
            if (uri === profileUri) {
              return {
                $ref: nestedUri,
                definitions: { ignored: { type: 'null' } },
                $defs: { ignored: { $ref: siblingUri } },
                description: { $ref: 'https://forms.example.test/unscanned.json' },
              }
            }
            return { type: 'string' }
          },
        },
      )

      expect(calls).toEqual([profileUri, nestedUri, siblingUri])
      expect((await adapter.validate({ profile: 'ok' })).valid).toBe(true)
      expect((await adapter.validate({ profile: 7 })).valid).toBe(false)
    })

    it('rejects malformed and file identifiers nested in a retrieved resource', async () => {
      const cases = [
        [{ properties: { nested: { $id: 'http://[invalid', type: 'string' } } }, profileUri],
        [{ properties: { nested: { $id: 'file:///tmp/nested.json', type: 'string' } } }, 'file:///tmp/nested.json'],
      ] as const

      for (const [resource, uri] of cases) {
        const result = await createAdapter(
          { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: profileUri },
          { resolveResource: () => resource },
        ).catch((error: unknown) => error)

        expect(result).toMatchObject({ name: 'SchemaResourceResolutionError', uri })
      }
    })

    it('preserves shared schema objects and Draft 7 tuple dependencies in a retrieved document', async () => {
      const shared = { type: 'string' }
      const supplied = {
        $id: profileUri,
        type: 'object',
        required: ['values'],
        properties: {
          left: shared,
          right: shared,
          values: { type: 'array', items: [shared, true] },
        },
        dependencies: { values: ['enabled'] },
      }
      const adapter = await createAdapter(
        { $schema: 'http://json-schema.org/draft-07/schema#', $id: rootUri, $ref: profileUri },
        { defaultDialect: 'draft-07', resolveResource: () => supplied },
      )

      expect(supplied.properties.left).toBe(shared)
      expect(adapter.project({}).nodes.get('/left' as JsonPointer)?.type).toBe('string')
      expect(adapter.project({}).nodes.get('/right' as JsonPointer)?.type).toBe('string')
      expect((await adapter.validate({ left: 'a', right: 'b', enabled: true, values: ['c'] })).valid).toBe(true)
      expect((await adapter.validate({ left: 'a', right: 'b', enabled: true, values: [3] })).valid).toBe(false)
      expect((await adapter.validate({ left: 'a', right: 'b', values: ['c'] })).valid).toBe(false)
    })

    it('resolves recursive references within a retrieved 2019-09 resource', async () => {
      const adapter = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          $id: rootUri,
          properties: { profile: { $ref: profileUri } },
        },
        {
          defaultDialect: '2019-09',
          resolveResource: () => ({
            $id: profileUri,
            $recursiveAnchor: true,
            type: 'object',
            properties: {
              name: { type: 'string' },
              next: { $recursiveRef: '#' },
            },
          }),
        },
      )

      expect((await adapter.validate({ profile: { name: 'Ada', next: { name: 'Grace' } } })).valid).toBe(true)
      expect((await adapter.validate({ profile: { name: 'Ada', next: { name: 7 } } })).valid).toBe(false)
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

    it('rejects invalid resource limits before calling the resolver', async () => {
      for (const maxExternalResources of [0, 1.5]) {
        const calls: string[] = []
        const result = await createAdapter(
          { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: profileUri },
          {
            maxExternalResources,
            resolveResource: (uri) => {
              calls.push(uri)
              return { type: 'string' }
            },
          },
        ).catch((error: unknown) => error)

        expect(result).toBeInstanceOf(RangeError)
        expect(calls).toEqual([])
      }
    })

    it('rejects a relative external reference without a base URI', async () => {
      const calls: string[] = []
      const result = await createAdapter(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', properties: { profile: { $ref: './profile.json' } } },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return { type: 'string' }
          },
        },
      ).catch((error: unknown) => error)

      expect(result).toMatchObject({
        name: 'SchemaResourceResolutionError',
        uri: undefined,
        referringPosition: '#/properties/profile/$ref',
      })
      expect(calls).toEqual([])
    })

    it('rejects file references discovered inside a retrieved document', async () => {
      const calls: string[] = []
      const result = await createAdapter(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: profileUri },
        {
          resolveResource: (uri) => {
            calls.push(uri)
            return { properties: { local: { $ref: 'file:///tmp/local.json' } } }
          },
        },
      ).catch((error: unknown) => error)

      expect(result).toMatchObject({
        name: 'SchemaResourceResolutionError',
        uri: 'file:///tmp/local.json',
        referringPosition: '#/properties/local/$ref',
      })
      expect(calls).toEqual([profileUri])
    })

    it('rejects malformed and non string identifiers on retrieved documents', async () => {
      for (const [supplied, uri] of [
        [{ $id: 7 }, profileUri],
        [{ $id: 'http://[invalid' }, profileUri],
        [{ $id: 'file:///tmp/resource.json' }, 'file:///tmp/resource.json'],
      ] as const) {
        const result = await createAdapter(
          { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: profileUri },
          { resolveResource: () => supplied },
        ).catch((error: unknown) => error)

        expect(result).toMatchObject({ name: 'SchemaResourceResolutionError', uri })
      }

      await expect(
        createAdapter(
          { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rootUri, $ref: profileUri },
          { resolveResource: () => 'not a schema' },
        ),
      ).rejects.toMatchObject({ name: 'SchemaResourceResolutionError', uri: profileUri })
    })

    it('rejects conflicting schemas that declare the same canonical identifier', async () => {
      const aliasUri = 'https://forms.example.test/profile-alias.json'
      const canonicalUri = 'https://schemas.example.test/profile.json'
      const result = await createAdapter(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: rootUri,
          properties: { profile: { $ref: profileUri }, alias: { $ref: aliasUri } },
        },
        {
          resolveResource: (uri) => uri === profileUri
            ? { $id: canonicalUri, type: 'object', required: ['name'], properties: { name: { type: 'string' } } }
            : { $id: canonicalUri, type: 'object', required: ['name'], properties: { name: { type: 'number' } } },
        },
      ).catch((error: unknown) => error)

      expect(result).toMatchObject({ name: 'SchemaResourceResolutionError', uri: aliasUri })
      expect((result as Error).message).toContain('conflicting schemas')
    })

    it('finds references in Draft 7 tuple items and leaves property dependencies intact', async () => {
      const calls: string[] = []
      const adapter = await createAdapter(
        {
          $schema: 'http://json-schema.org/draft-07/schema#',
          $id: rootUri,
          type: 'object',
          properties: { values: { type: 'array', items: [{ $ref: profileUri }, true] } },
          dependencies: { values: ['enabled'] },
        },
        {
          defaultDialect: 'draft-07',
          resolveResource: (uri) => {
            calls.push(uri)
            return { type: 'string' }
          },
        },
      )

      expect(calls).toEqual([profileUri])
      expect((await adapter.validate({ values: ['ok'], enabled: true })).valid).toBe(true)
      expect((await adapter.validate({ values: [1], enabled: true })).valid).toBe(false)
      expect((await adapter.validate({ values: ['ok'] })).valid).toBe(false)
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
