import { isSchemaNode, type SchemaNode } from 'json-schema-library'
import type { Dialect } from './dialect.js'
import { withoutUnreachableBranches } from './normalize.js'

type CompiledRoot = SchemaNode & { readonly context?: { readonly refs?: Record<string, unknown> } }

export class ProjectionValidationDivergenceError extends Error {
  readonly reference: string
  readonly sourcePosition: string
  readonly validationPosition: string
  readonly projectionPosition: string

  constructor(reference: string, sourcePosition: string, validationPosition: string, projectionPosition: string) {
    super(
      `Reference "${reference}" at "${sourcePosition}" resolves to different validation assertions in validation ` +
        `("${validationPosition}") and projection ("${projectionPosition}"). The adapter cannot compile this schema safely.`,
    )
    this.name = 'ProjectionValidationDivergenceError'
    this.reference = reference
    this.sourcePosition = sourcePosition
    this.validationPosition = validationPosition
    this.projectionPosition = projectionPosition
  }
}

function referenceSites(root: SchemaNode): Map<string, SchemaNode> {
  const refs = (root as CompiledRoot).context?.refs
  const sites = new Map<string, SchemaNode>()
  if (!refs) return sites
  for (const node of new Set(Object.values(refs))) {
    if (!isSchemaNode(node) || typeof node.$ref !== 'string') continue
    sites.set(`${node.schemaLocation}\n${node.evaluationPath}`, node)
  }
  return sites
}

const ASSERTION_KEYWORDS = [
  'type',
  'enum',
  'const',
  'multipleOf',
  'maximum',
  'exclusiveMaximum',
  'minimum',
  'exclusiveMinimum',
  'maxLength',
  'minLength',
  'pattern',
  'format',
  'maxItems',
  'minItems',
  'uniqueItems',
  'maxContains',
  'minContains',
  'maxProperties',
  'minProperties',
  'required',
  'dependencies',
  'dependentRequired',
  'additionalProperties',
  'additionalItems',
  'unevaluatedProperties',
  'unevaluatedItems',
  '$ref',
  '$dynamicRef',
  '$recursiveRef',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function escape(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

function validationContracts(schema: unknown, dialect: Dialect): Map<string, string[]> {
  const contracts = new Map<string, string[]>()
  const seenOnPath = new WeakMap<object, Set<string>>()
  const visit = (value: unknown, pointer: string): void => {
    if (typeof value === 'boolean') {
      const values = contracts.get(pointer) ?? []
      values.push(JSON.stringify({ schema: value }))
      contracts.set(pointer, values)
      return
    }
    if (!isRecord(value)) return
    const paths = seenOnPath.get(value) ?? new Set<string>()
    if (paths.has(pointer)) return
    paths.add(pointer)
    seenOnPath.set(value, paths)

    const profile = Object.fromEntries(
      ASSERTION_KEYWORDS
        .filter((key) => Object.hasOwn(value, key))
        .filter((key) => key !== 'format' || dialect === 'draft-07')
        .filter((key) => (key !== 'minContains' && key !== 'maxContains') || dialect !== 'draft-07')
        .filter((key) => (key !== 'unevaluatedProperties' && key !== 'unevaluatedItems') || dialect !== 'draft-07')
        .filter((key) => key !== 'additionalItems' || dialect !== '2020-12')
        .filter((key) => key !== 'additionalItems' || Array.isArray(value.items))
        .map((key) => [key, value[key]]),
    )
    if (Object.keys(profile).length > 0) {
      const values = contracts.get(pointer) ?? []
      values.push(JSON.stringify(profile))
      contracts.set(pointer, values)
    }

    for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
      const branches = value[keyword]
      if (Array.isArray(branches)) branches.forEach((branch) => visit(branch, pointer))
    }
    for (const keyword of ['if', 'then', 'else', 'not'] as const) visit(value[keyword], `${pointer}/${keyword}`)

    for (const keyword of ['properties', 'patternProperties'] as const) {
      const members = value[keyword]
      if (!isRecord(members)) continue
      for (const [key, child] of Object.entries(members)) visit(child, `${pointer}/${keyword}/${escape(key)}`)
    }

    for (const keyword of ['additionalProperties', 'propertyNames', 'contains'] as const) {
      visit(value[keyword], `${pointer}/${keyword}`)
    }

    if (dialect !== 'draft-07') {
      visit(value.unevaluatedProperties, `${pointer}/unevaluatedProperties`)
      visit(value.unevaluatedItems, `${pointer}/unevaluatedItems`)
      for (const keyword of ['dependentSchemas', 'dependencies'] as const) {
        const members = value[keyword]
        if (isRecord(members)) for (const child of Object.values(members)) visit(child, `${pointer}/${keyword}`)
      }
    } else {
      const members = value.dependencies
      if (isRecord(members)) for (const child of Object.values(members)) visit(child, `${pointer}/dependencies`)
    }

    const items = value.items
    if (isRecord(items)) visit(items, `${pointer}/items`)
    else if (Array.isArray(items) && dialect !== '2020-12') items.forEach((child, index) => visit(child, `${pointer}/items/${index}`))
    if (dialect === '2020-12' && Array.isArray(value.prefixItems)) {
      value.prefixItems.forEach((child, index) => visit(child, `${pointer}/prefixItems/${index}`))
    }
    if (dialect !== '2020-12' && Array.isArray(items)) visit(value.additionalItems, `${pointer}/additionalItems`)
  }

  visit(withoutUnreachableBranches(schema), '')
  return contracts
}

function sameValidationContracts(left: unknown, right: unknown, dialect: Dialect): boolean {
  const a = validationContracts(left, dialect)
  const b = validationContracts(right, dialect)
  if (a.size !== b.size) return false
  for (const [pointer, profiles] of a) {
    const other = b.get(pointer)
    if (!other || profiles.length !== other.length) return false
    profiles.sort()
    other.sort()
    if (profiles.some((profile, index) => profile !== other[index])) return false
  }
  return true
}

function resolveTarget(site: SchemaNode): SchemaNode | undefined {
  try {
    const target: unknown = site.resolveRef()
    return isSchemaNode(target) ? target : undefined
  } catch {
    return undefined
  }
}

export function assertProjectionValidationCoherence(validation: SchemaNode, projection: SchemaNode, dialect: Dialect): void {
  const validationSites = referenceSites(validation)
  const projectionSites = referenceSites(projection)

  for (const [siteKey, projectionSite] of projectionSites) {
    const validationSite = validationSites.get(siteKey)
    if (!validationSite || validationSite.$ref !== projectionSite.$ref) continue
    const validationTarget = resolveTarget(validationSite)
    const projectionTarget = resolveTarget(projectionSite)
    // Normalization may change a declaration in place; this guard targets scope collisions between declarations.
    if (validationTarget && projectionTarget && validationTarget.schemaLocation === projectionTarget.schemaLocation) continue
    if (validationTarget && projectionTarget && sameValidationContracts(validationTarget.schema, projectionTarget.schema, dialect)) continue
    if (!validationTarget && !projectionTarget) continue

    throw new ProjectionValidationDivergenceError(
      projectionSite.$ref!,
      projectionSite.schemaLocation,
      validationTarget?.schemaLocation ?? '<unresolved>',
      projectionTarget?.schemaLocation ?? '<unresolved>',
    )
  }
}
