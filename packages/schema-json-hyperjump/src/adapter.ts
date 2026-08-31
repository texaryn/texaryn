import { registerSchema as registerSchema2020 } from '@hyperjump/json-schema/draft-2020-12'
import { registerSchema as registerSchema201909 } from '@hyperjump/json-schema/draft-2019-09'
import { registerSchema as registerSchema07 } from '@hyperjump/json-schema/draft-07'
import { compile, getSchema, interpret, BASIC } from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'
import type { Output } from '@hyperjump/json-schema'
import type { SchemaProjection, ValidationResult } from '@texaryn/core'
import { detectDialect, type Dialect } from './dialect.js'
import { buildProjection } from './projection.js'
import { mapErrors } from './validation.js'
import type { HyperjumpAdapterConfig, HyperjumpAdapter } from './types.js'

const registerByDialect: Record<Dialect, typeof registerSchema2020> = {
  'draft-07': registerSchema07,
  '2019-09': registerSchema201909,
  '2020-12': registerSchema2020,
}

export async function createHyperjumpAdapter(
  schema: unknown,
  config?: HyperjumpAdapterConfig,
): Promise<HyperjumpAdapter> {
  // Hyperjump's schema registry is module-global (registerSchema keys by URI across the
  // whole process), so each adapter instance needs its own URI to avoid colliding with
  // another adapter instance registered for the same or a different schema.
  const id = `urn:texaryn:${crypto.randomUUID()}`
  const dialect = detectDialect(schema, {
    defaultDialect: config?.defaultDialect ?? 'draft-07',
  })

  const register = registerByDialect[dialect]
  register(schema as Parameters<typeof registerSchema2020>[0], id)

  const schemaDoc = await getSchema(id)
  const compiled = await compile(schemaDoc)

  return {
    project(data: unknown): SchemaProjection {
      return buildProjection(schema, compiled, data)
    },

    // hyperjump's async work (registerSchema -> getSchema -> compile) already happened
    // in this factory; interpret() on an already-compiled schema is a synchronous call,
    // so validate() returns a plain ValidationResult rather than a Promise. This is the
    // inverse of json-schema-library's adapter (sync factory, sync methods) -- both
    // shapes satisfy the port's MaybePromise<ValidationResult> return type.
    validate(data: unknown): ValidationResult {
      const output = interpret(
        compiled,
        Instance.fromJs(data as Parameters<typeof Instance.fromJs>[0]),
        BASIC,
      ) as Output
      return mapErrors(output)
    },
  }
}
