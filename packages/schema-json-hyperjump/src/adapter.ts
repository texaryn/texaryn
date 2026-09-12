import { registerSchema as registerSchema2020 } from '@hyperjump/json-schema/draft-2020-12'
import { registerSchema as registerSchema201909 } from '@hyperjump/json-schema/draft-2019-09'
import { registerSchema as registerSchema07 } from '@hyperjump/json-schema/draft-07'
import { compile, getSchema, interpret, BASIC } from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'
import type { Output } from '@hyperjump/json-schema'
import type { SchemaProjection, ValidationResult } from '@texaryn/core'
import { detectDialect, type Dialect } from './dialect.js'
import { buildProjection } from './projection.js'
import { toJsonInstance } from './json-instance.js'
import { mapErrors } from './validation.js'
import type { HyperjumpAdapterConfig, HyperjumpAdapter } from './types.js'

const registerByDialect: Record<Dialect, typeof registerSchema2020> = {
  'draft-07': registerSchema07,
  '2019-09': registerSchema201909,
  '2020-12': registerSchema2020,
}

// hyperjump determines a schema's dialect from its own `$schema`, and the
// per-dialect entry points above only load vocabularies: they carry no default.
// A schema that omits `$schema` is therefore rejected outright unless the
// dialect is named at registration, which is the third argument.
const dialectIds: Record<Dialect, string> = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
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
  register(schema as Parameters<typeof registerSchema2020>[0], id, dialectIds[dialect])

  const schemaDoc = await getSchema(id)
  const compiled = await compile(schemaDoc)

  return {
    project(data: unknown): SchemaProjection {
      return buildProjection(schema, compiled, toJsonInstance(data))
    },

    // hyperjump's async work (registerSchema -> getSchema -> compile) already happened
    // in this factory; interpret() on an already-compiled schema is a synchronous call,
    // so validate() returns a plain ValidationResult rather than a Promise. This is the
    // inverse of json-schema-library's adapter (sync factory, sync methods): both
    // shapes satisfy the port's MaybePromise<ValidationResult> return type.
    validate(data: unknown): ValidationResult {
      // `undefined` is not a JSON value and `Instance.fromJs` refuses it, while
      // the runtime holds it for a field the user has cleared. Read as absence
      // here, once, so both the interpreter and the error mapping below see the
      // same instance: `normalizeRequiredError` works out which required keys
      // are missing from the data it is given, and would report a cleared
      // property as present if it were handed the unconverted object.
      const instance = toJsonInstance(data)
      const output = interpret(
        compiled,
        Instance.fromJs(instance as Parameters<typeof Instance.fromJs>[0]),
        BASIC,
      ) as Output
      return mapErrors(output, schema, instance)
    },
  }
}
