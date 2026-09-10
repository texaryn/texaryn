import { interpret, BASIC, type CompiledSchema } from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'
import type { SchemaProjection, EnumOption } from '@texaryn/core'
import { ProjectionPlugin, type KeywordRecord } from './plugin.js'
import { schemaFragment, resolveJsonPointer } from './pointer-utils.js'
import {
  staticWalk,
  ensureNode,
  addChild,
  finalizeNodes,
  resolveTypeValue,
  type DraftNode,
  type BranchChecker,
} from './static-walk.js'
import { CONSTRAINT_KEYS, ANNOTATION_KEYS } from './constants.js'

/**
 * Reads branch selection off each construct's own local scope validity (see
 * ProjectionPlugin.scopeValidity), not off the (globally valid-gated) `records`
 * list: a `then` branch that is selected but currently incomplete (missing one
 * of its own required fields, the normal state of a form mid-edit) must still
 * read as selected, and that signal would otherwise be wiped out by its own
 * incompleteness cascading through the merge-up gate all the way to the root.
 *
 * `then`/`else` resolve through the *if* scope's validity.
 *
 * `oneOf`/`anyOf`: a branch is selected when it is directly valid, and for
 * `oneOf` only when no sibling is. When none is valid, none is selected, which
 * is what `active` has to say: the schema applies no branch to this data. That
 * state is the normal one for a form mid-edit, where the user has supplied a
 * discriminator and not yet the branch's required fields, and exposing the
 * branch then is provisional selection's job rather than this function's. See
 * `selectProvisionalBranch`.
 */
function makeBranchChecker(scopeValidity: Map<string, boolean>): BranchChecker {
  return (schemaPointer: string, instancePointer: string, suffix: string): boolean => {
    if (suffix === '/then' || suffix === '/else') {
      const ifValid = scopeValidity.get(`${schemaPointer}/if@${instancePointer}`)
      return suffix === '/then' ? ifValid === true : ifValid === false
    }

    const branchKey = `${schemaPointer}${suffix}@${instancePointer}`
    const directlyValid = scopeValidity.get(branchKey) === true

    const match = suffix.match(/^\/(oneOf|anyOf)\/(\d+)$/)
    if (!match) return directlyValid

    const [, keyword, indexStr] = match
    const branchIndex = parseInt(indexStr, 10)
    const prefix = `${schemaPointer}/${keyword}/`
    const atSuffix = `@${instancePointer}`

    if (directlyValid) {
      if (keyword === 'anyOf') return true
      // oneOf: ambiguity (multiple directly valid branches) means none selected
      for (const [key, valid] of scopeValidity) {
        if (!valid || !key.startsWith(prefix) || !key.endsWith(atSuffix)) continue
        const segment = key.slice(prefix.length, key.length - atSuffix.length)
        if (/^\d+$/.test(segment) && parseInt(segment, 10) !== branchIndex) return false
      }
      return true
    }

    // If any sibling branch is directly valid, this branch lost and is inactive.
    for (const [key, valid] of scopeValidity) {
      if (!valid || !key.startsWith(prefix) || !key.endsWith(atSuffix)) continue
      const segment = key.slice(prefix.length, key.length - atSuffix.length)
      if (/^\d+$/.test(segment)) return false
    }

    // No branch is directly valid, so none applies. `active` means JSON Schema
    // evaluation says the node applies, and nothing here does.
    //
    // This used to pick a best match by counting each branch's valid
    // sub-scopes, which reached the useful answer for a form mid-edit and
    // reached it in the wrong field: a branch validation rejects was reported
    // active. It was broader than any discriminator rule too, since a generic
    // constraint like `minLength` being satisfied could decide the winner, and
    // it applied to `anyOf` as well with an even looser tie-break. Exposing an
    // identified but unsatisfied branch is provisional selection's job, on an
    // explicit `const` or `enum`, which `staticWalk` does for `oneOf` alone.
    return false
  }
}

/**
 * Builds a SchemaProjection from a compiled schema and instance data in two passes.
 *
 * Pass 1 (data-driven, authoritative): interpret() with a ProjectionPlugin records every
 * keyword hyperjump actually evaluated, grouped by instance pointer; each keyword's raw
 * value is then resolved by JSON Pointer lookup into the original schema document (the
 * schemaUri fragment the plugin reports is exactly that pointer for local $ref/$defs).
 * This is authoritative wherever it applies, since it reflects exactly what was
 * evaluated for the data given: hyperjump only fires keyword evaluations for
 * instance pointers that exist in the data, so a declared-but-unfilled optional field is
 * indistinguishable, from firing alone, from a field in a branch that didn't match.
 *
 * Pass 2 (static, backfill): staticWalk() walks the raw schema document (bounded: local
 * $ref only, array items only where data provides them) to add nodes for
 * declared-but-currently-unfilled fields and to correctly mark declared-but-inactive-
 * branch fields as active: false. Fields pass 1 already populated are left untouched.
 * Branch selection for this pass comes from the plugin's per-scope validity map, not
 * from pass 1's `records` (see makeBranchChecker for why: pass 1's merge-up gate can
 * legitimately go empty for a schema that is only *incomplete*, not misselected).
 */
export function buildProjection(
  rawSchema: unknown,
  compiled: CompiledSchema,
  data: unknown,
): SchemaProjection {
  const plugin = new ProjectionPlugin()
  interpret(compiled, Instance.fromJs(data as Parameters<typeof Instance.fromJs>[0]), {
    outputFormat: BASIC,
    plugins: [plugin],
  })

  const byPointer = new Map<string, KeywordRecord[]>()
  for (const record of plugin.records) {
    const list = byPointer.get(record.instancePointer) ?? []
    list.push(record)
    byPointer.set(record.instancePointer, list)
  }

  const nodes = new Map<string, DraftNode>()

  for (const [pointer, records] of byPointer) {
    const node = ensureNode(nodes, pointer)
    node.active = true

    const resolvedByKeyword = new Map<string, unknown[]>()
    for (const record of records) {
      const value = resolveJsonPointer(rawSchema, schemaFragment(record.schemaUri))
      const list = resolvedByKeyword.get(record.keywordName) ?? []
      list.push(value)
      resolvedByKeyword.set(record.keywordName, list)
    }

    const type = resolveTypeValue(resolvedByKeyword.get('type')?.[0])
    if (type !== undefined) node.type = type
    const format = resolvedByKeyword.get('format')?.[0] as string | undefined
    if (format !== undefined) node.format = format

    for (const key of CONSTRAINT_KEYS) {
      const value = resolvedByKeyword.get(key)?.[0]
      if (value !== undefined) (node.constraints as Record<string, unknown>)[key] = value
    }
    for (const key of ANNOTATION_KEYS) {
      const value = resolvedByKeyword.get(key)?.[0]
      if (value !== undefined) (node.annotations as Record<string, unknown>)[key] = value
    }

    const enumValue = resolvedByKeyword.get('enum')?.[0]
    if (Array.isArray(enumValue)) {
      node.enumValues = enumValue.map((value): EnumOption => ({ value }))
    }

    const propertiesValues = resolvedByKeyword.get('properties')
    if (propertiesValues) {
      const requiredSets = resolvedByKeyword.get('required') as unknown[][] | undefined
      const requiredKeys = new Set<string>()
      for (const arr of requiredSets ?? []) {
        if (Array.isArray(arr)) for (const key of arr) requiredKeys.add(key as string)
      }
      for (const propsObj of propertiesValues) {
        if (propsObj && typeof propsObj === 'object') {
          for (const key of Object.keys(propsObj as Record<string, unknown>)) {
            addChild(nodes, pointer, key, requiredKeys.has(key))
          }
        }
      }
    }
  }

  staticWalk(
    rawSchema,
    data,
    '',
    '',
    true,
    false,
    makeBranchChecker(plugin.scopeValidity),
    nodes,
    new Set(),
    rawSchema,
  )

  return { nodes: finalizeNodes(nodes) }
}
