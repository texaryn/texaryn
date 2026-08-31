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
 * `then`/`else` resolve through the *if* scope's validity for exactly this
 * reason; oneOf/anyOf branches use their own scope's validity directly, since
 * each branch is evaluated independently of whether the instance overall
 * satisfies "exactly one"/"at least one".
 */
function makeBranchChecker(scopeValidity: Map<string, boolean>): BranchChecker {
  return (schemaPointer: string, instancePointer: string, suffix: string): boolean => {
    if (suffix === '/then' || suffix === '/else') {
      const ifValid = scopeValidity.get(`${schemaPointer}/if@${instancePointer}`)
      return suffix === '/then' ? ifValid === true : ifValid === false
    }
    return scopeValidity.get(`${schemaPointer}${suffix}@${instancePointer}`) === true
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
    makeBranchChecker(plugin.scopeValidity),
    nodes,
    new Set(),
    rawSchema,
  )

  return { nodes: finalizeNodes(nodes) }
}
