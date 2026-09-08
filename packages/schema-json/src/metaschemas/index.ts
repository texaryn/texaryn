import type { JsonSchema } from 'json-schema-library'
import type { Dialect } from '../dialect.js'

/**
 * Prefixes that identify a published metaschema document, mapped to the
 * dialect whose closure resolves it. Both schemes are listed because the
 * canonical form differs by dialect (Draft 7 publishes `http`, the later two
 * `https`) and a schema author may write either.
 */
const prefixes: ReadonlyArray<readonly [string, Dialect]> = [
  ['http://json-schema.org/draft-07/schema', 'draft-07'],
  ['https://json-schema.org/draft-07/schema', 'draft-07'],
  ['http://json-schema.org/draft/2019-09/', '2019-09'],
  ['https://json-schema.org/draft/2019-09/', '2019-09'],
  ['http://json-schema.org/draft/2020-12/', '2020-12'],
  ['https://json-schema.org/draft/2020-12/', '2020-12'],
]

function dialectFor(uri: string): Dialect | null {
  for (const [prefix, dialect] of prefixes) {
    if (uri.startsWith(prefix)) return dialect
  }
  return null
}

/**
 * Which metaschema closures a schema needs, by walking it for references.
 *
 * Only `$ref`, `$dynamicRef` and `$recursiveRef` count. `$schema` is
 * deliberately ignored: every schema declares one, and the validator maps it
 * to a draft without ever retrieving the document, so keying on it would load
 * these on every single compile.
 *
 * The dialect comes from the URI that was referenced rather than the one
 * detected for the schema, because a Draft 7 schema may reference the 2020-12
 * metaschema and would then need that closure instead of its own.
 */
export function referencedDialects(schema: unknown): Dialect[] {
  const found = new Set<Dialect>()
  const seen = new Set<object>()

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry)
      return
    }
    if (typeof node !== 'object' || node === null) return
    // Schemas are user input and may contain a cycle.
    if (seen.has(node)) return
    seen.add(node)

    for (const [key, value] of Object.entries(node)) {
      if (
        (key === '$ref' || key === '$dynamicRef' || key === '$recursiveRef') &&
        typeof value === 'string'
      ) {
        const dialect = dialectFor(value)
        if (dialect) found.add(dialect)
        continue
      }
      walk(value)
    }
  }

  walk(schema)
  return [...found]
}

/**
 * Draft 7 publishes its metaschema with `$id` ending in `#`, and
 * json-schema-library keys the remote registry by that string while resolving
 * a reference with the fragment removed, so the two never meet and the
 * document is only found when something else has already normalised it. An
 * empty fragment denotes the document itself, so dropping it identifies the
 * same resource; the vendored file stays byte-faithful to what the
 * specification publishes and this adapts it at the boundary.
 *
 * The documents are also copied rather than handed over directly, because
 * compileSchema normalises `$id` in place and the module-level arrays would
 * otherwise be mutated for every later caller.
 */
function normalize(documents: readonly JsonSchema[]): JsonSchema[] {
  return documents.map((document) => {
    const id = (document as { $id?: unknown }).$id
    if (typeof id !== 'string' || !id.endsWith('#')) return { ...(document as object) } as JsonSchema
    return { ...(document as object), $id: id.slice(0, -1) } as JsonSchema
  })
}

/**
 * The metaschema documents for the given dialects, imported on demand so a
 * consumer who never references a metaschema does not carry roughly 24kB of
 * specification documents.
 */
export async function loadMetaschemas(dialects: readonly Dialect[]): Promise<JsonSchema[]> {
  const loaded = await Promise.all(
    dialects.map(async (dialect) => {
      switch (dialect) {
        case 'draft-07':
          return (await import('./draft-07.js')).metaschemas
        case '2019-09':
          return (await import('./2019-09.js')).metaschemas
        case '2020-12':
          return (await import('./2020-12.js')).metaschemas
      }
    }),
  )
  return normalize(loaded.flat())
}
