import { isSchemaNode, type SchemaNode } from '@texaryn/json-schema-library'
import { isPre2019Dialect, type Dialect } from './dialect.js'
import { withoutUnreachableBranches } from './normalize.js'
import { compareCodeUnits } from './string-order.js'

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
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
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
  const profiles = [...node.profiles]
  profiles.sort(compareCodeUnits)
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
  for (const branches of applicators.values()) branches.sort(compareCodeUnits)
  const branchGroups = [...applicators]
    .map(([keyword, branches]) => [keyword, branches] as const)
    .sort(([left], [right]) => left.localeCompare(right))

  return JSON.stringify({ profiles, children, branchGroups })
}

interface ValidationContractTraversal {
  readonly root: ContractNode
  readonly dialect: Dialect
  readonly seenOnPath: WeakMap<object, Set<string>>
}

type AssertionKeyword = (typeof ASSERTION_KEYWORDS)[number]

function includesAssertionKeyword(
  key: AssertionKeyword,
  value: Record<string, unknown>,
  dialect: Dialect,
): boolean {
  if (!Object.hasOwn(value, key)) return false
  if (key === 'format' && !isPre2019Dialect(dialect)) return false
  if ((key === 'minContains' || key === 'maxContains') && isPre2019Dialect(dialect)) return false
  if ((key === 'unevaluatedProperties' || key === 'unevaluatedItems') && isPre2019Dialect(dialect)) return false
  if (key === 'additionalItems' && dialect === '2020-12') return false
  return key !== 'additionalItems' || Array.isArray(value.items)
}

function addValidationProfile(
  value: Record<string, unknown>,
  dialect: Dialect,
  node: ContractNode,
): void {
  const profile = Object.fromEntries(
    ASSERTION_KEYWORDS
      .filter((key) => includesAssertionKeyword(key, value, dialect))
      .map((key) => [key, value[key]]),
  )
  if (Object.keys(profile).length > 0) node.profiles.push(JSON.stringify(profile))
}

function visitApplicatorSchemas(
  value: Record<string, unknown>,
  path: readonly ContractSegment[],
  node: ContractNode,
  traversal: ValidationContractTraversal,
): void {
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const branches = value[keyword]
    if (!Array.isArray(branches)) continue
    node.profiles.push(JSON.stringify({ applicator: keyword, branchCount: branches.length }))
    branches.forEach((branch, index) =>
      visitValidationSchema(branch, [...path, { kind: 'applicator', keyword, index }], traversal),
    )
  }
}

function visitConditionalSchemas(
  value: Record<string, unknown>,
  path: readonly ContractSegment[],
  traversal: ValidationContractTraversal,
): void {
  for (const keyword of ['if', 'then', 'else', 'not'] as const) {
    visitValidationSchema(value[keyword], [...path, keyword], traversal)
  }
}

function visitPropertySchemas(
  value: Record<string, unknown>,
  path: readonly ContractSegment[],
  traversal: ValidationContractTraversal,
): void {
  for (const keyword of ['properties', 'patternProperties'] as const) {
    const members = value[keyword]
    if (!isRecord(members)) continue
    for (const [key, child] of Object.entries(members)) {
      visitValidationSchema(child, [...path, keyword, escape(key)], traversal)
    }
  }
}

function visitSingleKeywordSchemas(
  value: Record<string, unknown>,
  path: readonly ContractSegment[],
  traversal: ValidationContractTraversal,
): void {
  for (const keyword of ['additionalProperties', 'propertyNames', 'contains'] as const) {
    visitValidationSchema(value[keyword], [...path, keyword], traversal)
  }
}

function visitDependencySchemas(
  value: Record<string, unknown>,
  path: readonly ContractSegment[],
  traversal: ValidationContractTraversal,
): void {
  const { dialect } = traversal
  if (isPre2019Dialect(dialect)) {
    visitDependencyMap(value.dependencies, path, 'dependencies', traversal)
    return
  }
  visitValidationSchema(value.unevaluatedProperties, [...path, 'unevaluatedProperties'], traversal)
  visitValidationSchema(value.unevaluatedItems, [...path, 'unevaluatedItems'], traversal)
  visitDependencyMap(value.dependentSchemas, path, 'dependentSchemas', traversal)
  visitDependencyMap(value.dependencies, path, 'dependencies', traversal)
}

function visitDependencyMap(
  members: unknown,
  path: readonly ContractSegment[],
  keyword: 'dependencies' | 'dependentSchemas',
  traversal: ValidationContractTraversal,
): void {
  if (!isRecord(members)) return
  for (const [key, child] of Object.entries(members)) {
    visitValidationSchema(child, [...path, keyword, escape(key)], traversal)
  }
}

function visitItemSchemas(
  value: Record<string, unknown>,
  path: readonly ContractSegment[],
  traversal: ValidationContractTraversal,
): void {
  const { dialect } = traversal
  const items = value.items
  if (isRecord(items) || typeof items === 'boolean') {
    visitValidationSchema(items, [...path, 'items'], traversal)
  } else if (Array.isArray(items) && dialect !== '2020-12') {
    items.forEach((child, index) => visitValidationSchema(child, [...path, 'items', String(index)], traversal))
  }
  if (dialect === '2020-12' && Array.isArray(value.prefixItems)) {
    value.prefixItems.forEach((child, index) =>
      visitValidationSchema(child, [...path, 'prefixItems', String(index)], traversal),
    )
  }
  if (dialect !== '2020-12' && Array.isArray(items)) {
    visitValidationSchema(value.additionalItems, [...path, 'additionalItems'], traversal)
  }
}

function visitValidationSchema(
  value: unknown,
  path: readonly ContractSegment[],
  traversal: ValidationContractTraversal,
): void {
  const node = contractNodeAt(traversal.root, path)
  if (typeof value === 'boolean') {
    node.profiles.push(JSON.stringify({ schema: value }))
    return
  }
  if (!isRecord(value)) return
  const paths = traversal.seenOnPath.get(value) ?? new Set<string>()
  const pathKey = JSON.stringify(path)
  if (paths.has(pathKey)) return
  paths.add(pathKey)
  traversal.seenOnPath.set(value, paths)

  addValidationProfile(value, traversal.dialect, node)
  visitApplicatorSchemas(value, path, node, traversal)
  visitConditionalSchemas(value, path, traversal)
  visitPropertySchemas(value, path, traversal)
  visitSingleKeywordSchemas(value, path, traversal)
  visitDependencySchemas(value, path, traversal)
  visitItemSchemas(value, path, traversal)
}

function validationContracts(schema: unknown, dialect: Dialect): string {
  const root = createContractNode()
  const traversal: ValidationContractTraversal = { root, dialect, seenOnPath: new WeakMap() }
  visitValidationSchema(withoutUnreachableBranches(schema, [], dialect), [], traversal)
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
    const validationLocation = validationTarget?.schemaLocation
    const projectionLocation = projectionTarget?.schemaLocation
    if (validationLocation !== undefined && validationLocation === projectionLocation) continue
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
