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

    it('accepts its own declared initial data', async () => {
      const port = await createJsonSchemaAdapter(example.schema, {
        defaultDialect: example.dialect,
      })

      const result = await port.validate(example.initialData)
      expect(
        result.errors,
        `${example.id} initialData violates its own schema`,
      ).toEqual([])
    })
  },
)
