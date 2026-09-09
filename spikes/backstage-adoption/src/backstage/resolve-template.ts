import { parseAllDocuments, parse } from 'yaml'

/**
 * One entry of `spec.parameters`: a JSON Schema object for a form step, with
 * Backstage's `ui:*` presentation keys mixed in among the schema keywords.
 */
export type ParameterStep = Record<string, unknown>

export interface TemplateEntity {
  spec: { parameters: unknown; steps?: unknown }
}

/** What Backstage's placeholder resolvers are handed. Only `read` is used here. */
export type ReadUrl = (url: string) => Promise<string>

/**
 * Resolves a Template entity's placeholders the way Backstage's catalog does,
 * rather than by inventing a mechanism.
 *
 * Mirrors `plugins/catalog-backend/src/processors/PlaceholderProcessor.ts`:
 *
 * - an object is a placeholder only when it has exactly one key and that key
 *   starts with `$`. An object mixing a `$` key with others is left alone.
 * - an unrecognised `$` key is left alone. Upstream's comment on that branch
 *   is the reason this exercise never converts `$yaml` into a JSON Schema
 *   `$ref`: "If there was no such placeholder resolver, we err on the side of
 *   safety and assume that this is something that's best left alone. For
 *   example, if the input contains JSONSchema, there may be `$ref`:
 *   `#/definitions/node` nodes in the document."
 * - `$yaml` reads the URL, parses it, and requires exactly one document.
 *
 * Placeholders are resolved before the form is ever built, which is why the
 * signature returns plain JSON: by the time Texaryn or RJSF sees a step, the
 * fragment's origin is gone. Nesting is deliberately not supported, matching
 * the documented limitation ("You also cannot nest files").
 */
export async function resolveTemplateParameters(
  templateYaml: string,
  read: ReadUrl,
): Promise<ParameterStep[]> {
  const entity = parse(templateYaml) as TemplateEntity
  const parameters = entity.spec?.parameters

  if (!Array.isArray(parameters)) {
    throw new Error('spec.parameters is not an array of steps')
  }

  return Promise.all(parameters.map((step) => resolveStep(step, read)))
}

async function resolveStep(step: unknown, read: ReadUrl): Promise<ParameterStep> {
  const key = placeholderKey(step)
  if (key === null) return step as ParameterStep

  if (key !== 'yaml') {
    // Not a resolver this exercise registers. Upstream leaves it in place, so
    // this does too: replacing it with something would be the invention the
    // exercise is meant to avoid.
    return step as ParameterStep
  }

  const url = (step as Record<string, unknown>).$yaml
  if (typeof url !== 'string') throw new Error('$yaml value is not a string')

  const content = await read(url)
  const documents = parseAllDocuments(content, { merge: false }).filter((d) => d)

  if (documents.length !== 1) {
    throw new Error(
      `Placeholder $yaml expected to find exactly one document of data at ${url}, found ${documents.length}`,
    )
  }
  const document = documents[0]
  if (document.errors?.length) {
    throw new Error(`Placeholder $yaml found an error in the data at ${url}, ${document.errors[0]}`)
  }

  return document.toJSON() as ParameterStep
}

/** The resolver name of a placeholder object, or null if it is not one. */
function placeholderKey(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const keys = Object.keys(value)
  if (keys.length !== 1 || !keys[0].startsWith('$')) return null
  return keys[0].slice(1)
}
