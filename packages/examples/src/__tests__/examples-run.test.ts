// Every example has to survive the real pipeline: schema evaluation,
// projection, then runtime initialisation. Metadata being well formed is not
// evidence that an example still works.
import { describe, it, expect } from 'vitest'
import { createFormRuntime } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { examples } from '../registry.js'

describe.each(examples.map((example) => [example.id, example] as const))(
  'example %s',
  (_id, example) => {
    it('projects and initialises a runtime', async () => {
      const port = await createJsonSchemaAdapter(example.schema, {
        defaultDialect: example.dialect,
      })

      const runtime = createFormRuntime(port, {
        initialData: example.initialData,
        hints: example.hints,
      })

      const document = runtime.document.getSnapshot()
      expect(document.nodes[document.rootId], `${example.id} has no root node`).toBeDefined()
      expect(
        Object.keys(document.nodes).length,
        `${example.id} projected only a root and no fields`,
      ).toBeGreaterThan(1)

      runtime.destroy()
    })

    it('matches its declared initial validity', async () => {
      const port = await createJsonSchemaAdapter(example.schema, {
        defaultDialect: example.dialect,
      })

      const result = await port.validate(example.initialData)

      if (example.startsInvalid) {
        // Asserted rather than merely tolerated: an example that claims to
        // demonstrate validation is broken if its data is actually valid.
        expect(
          result.errors.length,
          `${example.id} declares startsInvalid but its data satisfies the schema`,
        ).toBeGreaterThan(0)
      } else {
        expect(
          result.errors,
          `${example.id} initialData violates its own schema`,
        ).toEqual([])
      }
    })

    it('declares presets whose validity matches the declaration', async () => {
      if (!example.presets) return
      const port = await createJsonSchemaAdapter(example.schema, { defaultDialect: example.dialect })
      const ids = new Set<string>()
      for (const preset of example.presets) {
        expect(ids.has(preset.id), `${example.id} repeats preset id ${preset.id}`).toBe(false)
        expect(['initial', 'custom'], `${example.id} uses a reserved preset id`).not.toContain(preset.id)
        expect(preset.data, `${example.id} preset ${preset.id} has undefined data`).not.toBeUndefined()
        ids.add(preset.id)
        const result = await port.validate(preset.data)
        if (preset.invalid) {
          expect(result.errors.length, `${example.id} preset ${preset.id} is marked invalid but passes`).toBeGreaterThan(0)
        } else {
          expect(result.errors, `${example.id} preset ${preset.id} violates its schema`).toEqual([])
        }
      }
    })
  },
)

describe('presets', () => {
  it('exist for the examples where form states matter', () => {
    const ids = [
      'basics-required',
      'validation-string-constraints',
      'validation-numeric-constraints',
      'validation-exclusive-numeric-constraints',
      'validation-array-constraints',
      'conditional-if-then-else',
      'composition-one-of',
      'composition-any-of',
      'runtime-array-interactions',
      'runtime-validation-triggers',
      'runtime-submission',
    ]
    for (const id of ids) {
      expect(examples.find((example) => example.id === id)?.presets?.length, id).toBeGreaterThan(0)
    }
  })
})
