import { resolveJsonPointer, schemaFragment, escapeSegment } from './pointer-utils.js'
import { deepEqual, selectProvisionalBranch } from './static-walk.js'
import type { BranchChecker } from './static-walk.js'

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
  isBranchActive?: BranchChecker,
): Map<string, readonly string[]> {
  const declarations = new Map<string, DefaultDeclaration[]>()

  const record = (pointer: string, declaration: DefaultDeclaration): void => {
    const list = declarations.get(pointer) ?? []
    list.push(declaration)
    declarations.set(pointer, list)
  }

  const visit = (
    schema: unknown,
    current: unknown,
    pointer: string,
    schemaPointer: string,
    visited: Set<string>,
  ): void => {
    if (!isRecord(schema)) return

    // A `$ref` is followed to its target, which then stands in for this
    // position entirely: `schemaPointer` becomes the target's, so a declaration
    // is named by where it is written rather than by what pointed at it.
    //
    // The cycle guard is `staticWalk`'s, and it has to be. While the instance
    // provides data the pair of pointers is the key, so the same recursive
    // `$ref` is walked once per instance depth. Past the instance boundary the
    // schema pointer alone is the key: the instance pointer would keep growing
    // and no key would ever repeat, so a recursive `$ref` would not terminate.
    const ref =
      typeof schema.$ref === 'string' && schema.$ref.startsWith('#') ? schema.$ref : undefined
    if (ref !== undefined) {
      const target = schemaFragment(ref)
      const cycleKey =
        current === undefined || current === null ? target : `${target}@${pointer}`
      if (visited.has(cycleKey)) return
      visited.add(cycleKey)
      visit(resolveJsonPointer(rootSchema, target), current, pointer, target, visited)
      visited.delete(cycleKey)
      return
    }

    if ('default' in schema) record(pointer, { value: schema.default, source: schemaPointer })

    if (Array.isArray(schema.allOf)) {
      schema.allOf.forEach((branch, index) => {
        visit(branch, current, pointer, `${schemaPointer}/allOf/${index}`, visited)
      })
    }

    // The conditional edges, entered only where the caller asked for them and
    // only where this instance selects them. The rules mirror `staticWalk`'s
    // exactly, because they are the same question: `then`/`else` resolve
    // through the `if` scope's own validity, `oneOf` contributes one branch or
    // the provisionally identified one, `anyOf` contributes every branch that
    // validates, and `dependentSchemas` follows key presence.
    if (isBranchActive !== undefined) {
      if (isRecord(schema.if) && (isRecord(schema.then) || isRecord(schema.else))) {
        if (isRecord(schema.then) && isBranchActive(schemaPointer, pointer, '/then')) {
          visit(schema.then, current, pointer, `${schemaPointer}/then`, visited)
        }
        if (isRecord(schema.else) && isBranchActive(schemaPointer, pointer, '/else')) {
          visit(schema.else, current, pointer, `${schemaPointer}/else`, visited)
        }
      }

      if (Array.isArray(schema.oneOf)) {
        const branches = schema.oneOf as unknown[]
        const local = branches.map((_, index) =>
          isBranchActive(schemaPointer, pointer, `/oneOf/${index}`),
        )
        // A provisionally identified branch competes, though it does not
        // validate: the projection exposes it and a policy fills from it, so a
        // disagreement it carries has to be visible where the fill happens.
        const selected = local.some(Boolean)
          ? undefined
          : selectProvisionalBranch(branches, current, rootSchema)
        branches.forEach((branch, index) => {
          if (!local[index] && index !== selected) return
          visit(branch, current, pointer, `${schemaPointer}/oneOf/${index}`, visited)
        })
      }

      if (Array.isArray(schema.anyOf)) {
        ;(schema.anyOf as unknown[]).forEach((branch, index) => {
          if (!isBranchActive(schemaPointer, pointer, `/anyOf/${index}`)) return
          visit(branch, current, pointer, `${schemaPointer}/anyOf/${index}`, visited)
        })
      }

      if (isRecord(schema.dependentSchemas)) {
        for (const [key, branch] of Object.entries(schema.dependentSchemas)) {
          if (!isRecord(current) || !(key in current)) continue
          visit(
            branch,
            current,
            pointer,
            `${schemaPointer}/dependentSchemas/${escapeSegment(key)}`,
            visited,
          )
        }
      }
    }

    if (isRecord(schema.properties)) {
      for (const [key, child] of Object.entries(schema.properties)) {
        const escaped = escapeSegment(key)
        visit(
          child,
          isRecord(current) ? current[key] : undefined,
          `${pointer}/${escaped}`,
          `${schemaPointer}/properties/${escaped}`,
          visited,
        )
      }
    }

    // Both `items` forms, as `staticWalk` supports both: a single subschema in
    // 2019-09 and later, and a positional tuple in draft-07.
    const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : undefined
    const tupleItems = Array.isArray(schema.items) ? schema.items : undefined
    const singleItems = !tupleItems && schema.items !== undefined ? schema.items : undefined
    if ((singleItems !== undefined || prefixItems || tupleItems) && Array.isArray(current)) {
      const keyword = prefixItems ? 'prefixItems' : 'items'
      current.forEach((item, index) => {
        const itemSchema = prefixItems?.[index] ?? tupleItems?.[index] ?? singleItems
        if (itemSchema === undefined) return
        visit(
          itemSchema,
          item,
          `${pointer}/${index}`,
          prefixItems || tupleItems
            ? `${schemaPointer}/${keyword}/${index}`
            : `${schemaPointer}/${keyword}`,
          visited,
        )
      })
    }
  }

  visit(rootSchema, data, '', '', new Set())

  const conflicts = new Map<string, readonly string[]>()
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
