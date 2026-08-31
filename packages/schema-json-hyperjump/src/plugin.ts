import type { EvaluationPlugin, ValidationContext } from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'
import type { JsonNode } from '@hyperjump/json-schema/instance/experimental'
import { keywordNameFromId, instancePointerFromUri, schemaFragment } from './pointer-utils.js'

export interface KeywordRecord {
  keywordName: string
  keywordId: string
  schemaUri: string
  instancePointer: string
}

interface ProjectionContext extends ValidationContext {
  scopeRecords?: KeywordRecord[]
}

/**
 * Records every keyword evaluated during interpret(), gated by the same
 * beforeSchema/afterSchema valid-propagation pattern hyperjump's own built-in
 * AnnotationsPlugin uses. A schema scope's records are only merged into its
 * parent's list when that scope validated, so records from a failing
 * oneOf/if branch never surface: this is what gives automatic
 * annotation/constraint suppression for the non-matching branch, driven
 * entirely by the public EvaluationPlugin API.
 *
 * That merge-up gate is deliberately global: a schema scope's records only reach
 * `records` if every enclosing scope up to the root also validated, so a single
 * missing required field anywhere empties `records` entirely (this mirrors
 * hyperjump's own built-in AnnotationsPlugin, and is why its annotate() throws on
 * an invalid document rather than returning partial data). That is unusable for
 * deciding which if/then/else or oneOf/anyOf branch is currently selected, since a
 * form mid-edit is normally incomplete somewhere. `scopeValidity` tracks each
 * scope's own local valid flag unconditionally, independent of that cascade, so
 * branch selection can be read directly off the construct that actually decides it
 * (the `if` scope's own validity, or a oneOf/anyOf branch's own scope) rather than
 * off a signal that can be wiped out by an unrelated failure elsewhere in the
 * document. Keyed by schema fragment plus instance pointer, since a $ref evaluated
 * at multiple instance depths (recursion) shares one schema fragment.
 */
export class ProjectionPlugin implements EvaluationPlugin<ProjectionContext> {
  readonly id = 'https://texaryn.dev/plugins/projection'
  readonly records: KeywordRecord[] = []
  readonly scopeValidity = new Map<string, boolean>()
  private stack: KeywordRecord[][] = []

  beforeSchema(_url: string, _instance: JsonNode, context: ProjectionContext): void {
    context.scopeRecords = []
    this.stack.push(context.scopeRecords)
  }

  afterKeyword(
    node: readonly [string, string, unknown],
    instance: JsonNode,
    _context: ProjectionContext,
    _valid: boolean,
    schemaContext: ProjectionContext,
  ): void {
    const [keywordId, schemaUri] = node
    schemaContext.scopeRecords!.push({
      keywordName: keywordNameFromId(keywordId),
      keywordId,
      schemaUri,
      instancePointer: instancePointerFromUri(Instance.uri(instance)),
    })
  }

  afterSchema(url: string, instance: JsonNode, _context: ProjectionContext, valid: boolean): void {
    const instancePointer = instancePointerFromUri(Instance.uri(instance))
    this.scopeValidity.set(`${schemaFragment(url)}@${instancePointer}`, valid)

    const mine = this.stack.pop()!
    if (valid) {
      const parent = this.stack[this.stack.length - 1]
      if (parent) parent.push(...mine)
      else this.records.push(...mine)
    }
  }
}
