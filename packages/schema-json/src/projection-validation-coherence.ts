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

type ContractSegment =
  | string
  | { readonly kind: 'applicator'; readonly keyword: 'allOf' | 'anyOf' | 'oneOf'; readonly index: number }

interface ContractNode {
  readonly profiles: string[]
  readonly children: Map<string, { readonly segment: ContractSegment; readonly node: ContractNode }>
}

function createContractNode(): ContractNode {
  return { profiles: [], children: new Map() }
}

function contractNodeAt(root: ContractNode, path: readonly ContractSegment[]): ContractNode {
  let node = root
  for (const segment of path) {
    const key = JSON.stringify(segment)
    let child = node.children.get(key)
    if (!child) {
      child = { segment, node: createContractNode() }
      node.children.set(key, child)
    }
    node = child.node
  }
  return node
}

function serializeContract(node: ContractNode): string {
  const profiles = [...node.profiles].sort()
  const children: Array<readonly [string, string]> = []
  const applicators = new Map<string, string[]>()

  for (const { segment, node: child } of node.children.values()) {
    const contract = serializeContract(child)
    if (typeof segment === 'string') {
      children.push([segment, contract])
      continue
    }
    const branches = applicators.get(segment.keyword) ?? []
    branches.push(contract)
    applicators.set(segment.keyword, branches)
  }

  children.sort(([left], [right]) => left.localeCompare(right))
  const branchGroups = [...applicators]
    .map(([keyword, branches]) => [keyword, branches.sort()] as const)
    .sort(([left], [right]) => left.localeCompare(right))

  return JSON.stringify({ profiles, children, branchGroups })
}

function validationContracts(schema: unknown, dialect: Dialect): string {
  const root = createContractNode()
  const seenOnPath = new WeakMap<object, Set<string>>()
  const visit = (value: unknown, path: readonly ContractSegment[]): void => {
    const node = contractNodeAt(root, path)
    if (typeof value === 'boolean') {
      node.profiles.push(JSON.stringify({ schema: value }))
      return
    }
    if (!isRecord(value)) return
    const paths = seenOnPath.get(value) ?? new Set<string>()
    const pathKey = JSON.stringify(path)
    if (paths.has(pathKey)) return
    paths.add(pathKey)
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
    if (Object.keys(profile).length > 0) node.profiles.push(JSON.stringify(profile))

    for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
      const branches = value[keyword]
      if (!Array.isArray(branches)) continue
      node.profiles.push(JSON.stringify({ applicator: keyword, branchCount: branches.length }))
      branches.forEach((branch, index) => visit(branch, [...path, { kind: 'applicator', keyword, index }]))
    }
    for (const keyword of ['if', 'then', 'else', 'not'] as const) visit(value[keyword], [...path, keyword])

    for (const keyword of ['properties', 'patternProperties'] as const) {
      const members = value[keyword]
      if (!isRecord(members)) continue
      for (const [key, child] of Object.entries(members)) visit(child, [...path, keyword, escape(key)])
    }

    for (const keyword of ['additionalProperties', 'propertyNames', 'contains'] as const) {
      visit(value[keyword], [...path, keyword])
    }

    if (dialect !== 'draft-07') {
      visit(value.unevaluatedProperties, [...path, 'unevaluatedProperties'])
      visit(value.unevaluatedItems, [...path, 'unevaluatedItems'])
      for (const keyword of ['dependentSchemas', 'dependencies'] as const) {
        const members = value[keyword]
        if (isRecord(members)) {
          for (const [key, child] of Object.entries(members)) visit(child, [...path, keyword, escape(key)])
        }
      }
    } else {
      const members = value.dependencies
      if (isRecord(members)) {
        for (const [key, child] of Object.entries(members)) visit(child, [...path, 'dependencies', escape(key)])
      }
    }

    const items = value.items
    if (isRecord(items) || typeof items === 'boolean') visit(items, [...path, 'items'])
    else if (Array.isArray(items) && dialect !== '2020-12') {
      items.forEach((child, index) => visit(child, [...path, 'items', String(index)]))
    }
    if (dialect === '2020-12' && Array.isArray(value.prefixItems)) {
      value.prefixItems.forEach((child, index) => visit(child, [...path, 'prefixItems', String(index)]))
    }
    if (dialect !== '2020-12' && Array.isArray(items)) visit(value.additionalItems, [...path, 'additionalItems'])
  }

  visit(withoutUnreachableBranches(schema), [])
  return serializeContract(root)
}

function sameValidationContracts(left: unknown, right: unknown, dialect: Dialect): boolean {
  return validationContracts(left, dialect) === validationContracts(right, dialect)
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
