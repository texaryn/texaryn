import { resolveJsonPointer, schemaFragment, escapeSegment } from './pointer-utils.js'
import { deepEqual, liveBranch, selectProvisionalBranch } from './static-walk.js'
import type { BranchChecker } from './static-walk.js'
import type { Dialect } from './dialect.js'
import { compareCodeUnits } from './string-order.js'

/** One `default` declaration, and the schema position that makes it. */
interface DefaultDeclaration {
  value: unknown
  source: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Where two or more `default` declarations apply to one instance location
 * whatever the instance is, and disagree: an instance pointer to the schema
 * positions that declared them.
 *
 * A separate traversal from `staticWalk`, deliberately. The question here is
 * what the schema says about a location, which needs neither the validity of a
 * branch nor which node a pass already filled, and answering it inside that
 * walk would mean threading both a provenance record and an
 * is-this-still-unconditional flag through ten parameters that the projection's
 * branch selection already depends on.
 *
 * The edges followed are the unconditional ones: a schema's own keywords, its
 * `allOf` branches, whatever a local `$ref` resolves to, and the `properties`
 * and `items` that address a child location. Nothing about an instance can make
 * one of those not apply, so two of them declaring different values is a fact
 * about the schema with no instance that resolves it.
 *
 * `oneOf`, `anyOf`, `if`/`then`/`else` and `dependentSchemas` are not entered
 * at all, and not because their conflicts are less real. A declaration one of
 * them carries competes only while its branch is selected, so whether it
 * disagrees is a state of the data, and `SchemaProjection.diagnostics` carries
 * facts about schemas. A location that exists only inside such a branch is
 * therefore not visited here, which is the same statement: every declaration it
 * could have is conditional.
 *
 * `data` is read for one thing, the indices an array actually has, because an
 * element's pointer is a fact about the instance rather than about the schema.
 */
export function collectDefaultConflicts(
  rootSchema: unknown,
  data: unknown,
  /**
   * Given, the walk also enters the conditional branches this instance selects,
   * which answers a different question: what applies to the data as it stands
   * rather than to every instance. That is what
   * `NodeProjection.defaultConflict` reports, and the schema-level diagnostic
   * stays the run without it.
   *
   * It is the projection's own checker rather than a second evaluator, so a
   * branch cannot be counted here and reported inactive on the node, or the
   * other way round.
   */
  isBranchActive: BranchChecker | undefined,
  /** The pointers the projection holds; the walk enters no other location. */
  projected: { has(pointer: string): boolean },
  dialect: Dialect,
  /** Receives the positions declaring each pointer's `default`, sorted and without duplicates. */
  sourcesOut?: Map<string, readonly string[]>,
): Map<string, readonly string[]> {
  const declarations = new Map<string, DefaultDeclaration[]>()

  const record = (pointer: string, declaration: DefaultDeclaration): void => {
    const list = declarations.get(pointer) ?? []
    list.push(declaration)
    declarations.set(pointer, list)
  }

  function visitLocalReference(
    schema: Record<string, unknown>,
    current: unknown,
    pointer: string,
    schemaPointer: string,
    visited: Set<string>,
  ): 'none' | 'continue' | 'stop' {
    const ref = typeof schema.$ref === 'string' && schema.$ref.startsWith('#') ? schema.$ref : undefined
    if (ref === undefined) return 'none'
    const target = schemaFragment(ref)
    const cycleKey = `${target}@${pointer}`
    if (visited.has(cycleKey)) return 'stop'
    visited.add(cycleKey)
    if (dialect !== 'draft-07' && 'default' in schema) {
      record(pointer, { value: schema.default, source: schemaPointer })
    }
    visit(resolveJsonPointer(rootSchema, target), current, pointer, target, visited)
    visited.delete(cycleKey)
    return dialect === 'draft-07' ? 'stop' : 'continue'
  }

  function visitAllOf(schema: Record<string, unknown>, current: unknown, pointer: string, schemaPointer: string, visited: Set<string>): void {
    if (!Array.isArray(schema.allOf)) return
    schema.allOf.forEach((branch, index) => {
      visit(branch, current, pointer, `${schemaPointer}/allOf/${index}`, visited)
    })
  }

  function visitConditionalBranches(
    schema: Record<string, unknown>,
    current: unknown,
    pointer: string,
    schemaPointer: string,
    visited: Set<string>,
  ): void {
    if (isRecord(schema.if) && (isRecord(schema.then) || isRecord(schema.else))) {
      if (isRecord(schema.then) && isBranchActive!(schemaPointer, pointer, '/then')) {
        visit(schema.then, current, pointer, `${schemaPointer}/then`, visited)
      }
      if (isRecord(schema.else) && isBranchActive!(schemaPointer, pointer, '/else')) {
        visit(schema.else, current, pointer, `${schemaPointer}/else`, visited)
      }
    }
    const live = liveBranch(schema)
    if (live !== undefined) visit(schema[live], current, pointer, `${schemaPointer}/${live}`, visited)
    visitOneOfBranches(schema, current, pointer, schemaPointer, visited)
    visitAnyOfBranches(schema, current, pointer, schemaPointer, visited)
    visitDependentSchemas(schema, current, pointer, schemaPointer, visited)
  }

  function visitOneOfBranches(schema: Record<string, unknown>, current: unknown, pointer: string, schemaPointer: string, visited: Set<string>): void {
    if (!Array.isArray(schema.oneOf)) return
    const branches = schema.oneOf as unknown[]
    const local = branches.map((_, index) => isBranchActive!(schemaPointer, pointer, `/oneOf/${index}`))
    // A provisionally identified branch competes, though it does not validate: the projection exposes it and a policy fills from it.
    const selected = local.some(Boolean) ? undefined : selectProvisionalBranch(branches, current, rootSchema)
    branches.forEach((branch, index) => {
      if (!local[index] && index !== selected) return
      visit(branch, current, pointer, `${schemaPointer}/oneOf/${index}`, visited)
    })
  }

  function visitAnyOfBranches(schema: Record<string, unknown>, current: unknown, pointer: string, schemaPointer: string, visited: Set<string>): void {
    const branches = schema.anyOf
    if (!Array.isArray(branches)) return
    branches.forEach((branch, index) => {
      if (!isBranchActive!(schemaPointer, pointer, `/anyOf/${index}`)) return
      visit(branch, current, pointer, `${schemaPointer}/anyOf/${index}`, visited)
    })
  }

  function visitDependentSchemas(schema: Record<string, unknown>, current: unknown, pointer: string, schemaPointer: string, visited: Set<string>): void {
    if (dialect === 'draft-07' || !isRecord(schema.dependentSchemas)) return
    for (const [key, branch] of Object.entries(schema.dependentSchemas)) {
      if (!isRecord(current) || !(key in current)) continue
      visit(branch, current, pointer, `${schemaPointer}/dependentSchemas/${escapeSegment(key)}`, visited)
    }
  }

  function visitProperties(schema: Record<string, unknown>, current: unknown, pointer: string, schemaPointer: string, visited: Set<string>): void {
    if (!isRecord(schema.properties)) return
    for (const [key, child] of Object.entries(schema.properties)) {
      const escaped = escapeSegment(key)
      const childPointer = `${pointer}/${escaped}`
      const childCurrent = isRecord(current) ? current[key] : undefined
      if (!projected.has(childPointer)) continue
      visit(child, childCurrent, childPointer, `${schemaPointer}/properties/${escaped}`, visited)
    }
  }

  function visitItems(schema: Record<string, unknown>, current: unknown, pointer: string, schemaPointer: string, visited: Set<string>): void {
    const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : undefined
    const tupleItems = Array.isArray(schema.items) ? schema.items : undefined
    const singleItems = !tupleItems && schema.items !== undefined ? schema.items : undefined
    if ((singleItems === undefined && !prefixItems && !tupleItems) || !Array.isArray(current)) return
    current.forEach((item, index) => {
      let tuple: 'prefixItems' | 'items' | undefined
      if (prefixItems?.[index] != null) tuple = 'prefixItems'
      else if (tupleItems?.[index] != null) tuple = 'items'
      const itemSchema = tuple === undefined ? singleItems : (schema[tuple] as unknown[])[index]
      if (itemSchema === undefined || !projected.has(`${pointer}/${index}`)) return
      const itemSchemaPointer = tuple === undefined ? `${schemaPointer}/items` : `${schemaPointer}/${tuple}/${index}`
      visit(itemSchema, item, `${pointer}/${index}`, itemSchemaPointer, visited)
    })
  }

  function visit(schema: unknown, current: unknown, pointer: string, schemaPointer: string, visited: Set<string>): void {
    if (!isRecord(schema)) return
    const referenceAction = visitLocalReference(schema, current, pointer, schemaPointer, visited)
    if (referenceAction === 'stop') return
    if (referenceAction === 'none' && 'default' in schema) {
      record(pointer, { value: schema.default, source: schemaPointer })
    }
    visitAllOf(schema, current, pointer, schemaPointer, visited)
    if (isBranchActive !== undefined) visitConditionalBranches(schema, current, pointer, schemaPointer, visited)
    visitProperties(schema, current, pointer, schemaPointer, visited)
    visitItems(schema, current, pointer, schemaPointer, visited)
  }

  visit(rootSchema, data, '', '', new Set())

  const conflicts = new Map<string, readonly string[]>()
  if (sourcesOut) {
    for (const [pointer, list] of declarations) {
      sourcesOut.set(pointer, [...new Set(list.map((declaration) => declaration.source))].sort(compareCodeUnits))
    }
  }
  for (const [pointer, list] of declarations) {
    const [first, ...rest] = list
    // Several declarations that agree state the same answer more than once,
    // which is not a disagreement however many times it is said. Compared by
    // value, as ADR-003's own pass compares them: two branches declaring an
    // equal object have nothing to choose between.
    if (rest.every((other) => deepEqual(other.value, first!.value))) continue
    conflicts.set(
      pointer,
      list.map((declaration) => declaration.source),
    )
  }
  return conflicts
}
