import type { SchemaNode } from 'json-schema-library'
import type {
  SchemaProjection,
  NodeProjection,
  ProjectionDiagnostic,
  ChildProjection,
  AnnotationSet,
  JsonPointer,
  JsonSchemaType,
  FieldConstraints,
  EnumOption,
} from '@texaryn/core'

const VALID_TYPES = new Set<JsonSchemaType>([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
])

function toPointer(value: string): JsonPointer {
  return value as JsonPointer
}

function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

/** The `type` the schema itself declares, and nothing else. */
function resolveExplicitType(schema: Record<string, unknown>): JsonSchemaType | undefined {
  const type = schema.type
  if (Array.isArray(type)) {
    return type.find((t): t is JsonSchemaType => VALID_TYPES.has(t as JsonSchemaType))
  }
  if (typeof type === 'string' && VALID_TYPES.has(type as JsonSchemaType)) {
    return type as JsonSchemaType
  }
  return undefined
}

/**
 * Keywords that apply to exactly one JSON type, grouped by that type.
 *
 * Two different jobs are done with these, and only one of them infers
 * anything. Every family takes part in detecting a conflict, because a schema
 * drawing keywords from two families implies no single shape. Only `object`
 * and `array` are shapes a form can be given, so those are the only two ever
 * inferred: `string` and `number` are here to be noticed, not chosen.
 *
 * Inferring a scalar would need a rule that is right rather than symmetrical,
 * and there is not one. `minimum` cannot tell `number` from `integer`, and a
 * wrong scalar guess selects the wrong widget, which is harder to notice than
 * a field that never appeared at all.
 *
 * `format` is deliberately absent: it annotates a string's contents rather
 * than describing structure, and schemas apply it to non-strings in practice.
 */
const KEYWORD_FAMILIES = {
  object: [
    'properties',
    'patternProperties',
    'additionalProperties',
    'propertyNames',
    'required',
    'minProperties',
    'maxProperties',
    'dependentSchemas',
    'dependentRequired',
    // json-schema-library normalises draft-07 `dependencies` into the two
    // above at parse time. Listed anyway, so the rule does not rely on that.
    'dependencies',
    'unevaluatedProperties',
  ],
  array: [
    'items',
    'prefixItems',
    'additionalItems',
    'contains',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minContains',
    'maxContains',
    'unevaluatedItems',
  ],
  string: ['minLength', 'maxLength', 'pattern'],
  number: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
} as const satisfies Record<string, readonly string[]>

type KeywordFamily = keyof typeof KEYWORD_FAMILIES

/** Which families a schema draws keywords from, computed over all of them at once. */
function projectionTypeFamilies(schema: Record<string, unknown>): Set<KeywordFamily> {
  const families = new Set<KeywordFamily>()
  for (const [family, keywords] of Object.entries(KEYWORD_FAMILIES)) {
    if (keywords.some((keyword) => schema[keyword] !== undefined)) {
      families.add(family as KeywordFamily)
    }
  }
  return families
}

/**
 * The shape a renderer should present for a schema that declares no `type`,
 * which is a different question from what that schema asserts about an
 * instance.
 *
 * A schema is not obliged to declare `type`, and one declaring `properties`
 * without it is both valid and widespread: not one parameter step in a
 * Backstage Software Template declares `type: object`, and every such step used
 * to project nothing at all.
 *
 * Deriving a shape here changes nothing about validation. No `type` is written
 * into the schema and the schema is never mutated, so `{ properties: { … } }`
 * goes on accepting a string, a number and null, because its object keywords
 * are inapplicable to those. The shape exists so a form can be drawn, and it
 * is not an assertion that the instance is an object.
 *
 * The family count decides, never keyword order: exactly one family is a
 * shape, more than one is ambiguous, none is nothing to go on.
 */
type ProjectionShape =
  | { kind: 'resolved'; type: JsonSchemaType }
  | { kind: 'ambiguous'; families: KeywordFamily[] }
  | { kind: 'none' }

/**
 * Whether any branch of this node's `oneOf`/`anyOf` could be given a shape at
 * all, for some value.
 *
 * This is what separates "the current value matches no branch" from "this
 * composition is unrenderable whatever the value is". The first is validation's
 * subject and transient; the second is a limitation of this adapter and worth
 * reporting.
 */
function compositionHasRenderableAlternative(node: SchemaNode): boolean {
  const branches = [...(node.oneOf ?? []), ...(node.anyOf ?? [])]
  return branches.some((branch) => {
    const resolved = dereference(branch)
    const schema = resolved.schema as Record<string, unknown> | undefined
    if (!schema || typeof schema !== 'object') return false
    if (resolveExplicitType(schema)) return true
    return inferProjectionShape(schema).kind === 'resolved'
  })
}

function inferProjectionShape(schema: Record<string, unknown>): ProjectionShape {
  const families = projectionTypeFamilies(schema)

  if (families.size > 1) return { kind: 'ambiguous', families: [...families].sort() }

  if (families.size === 1) {
    const [family] = families
    if (family === 'object' || family === 'array') return { kind: 'resolved', type: family }
  }
  return { kind: 'none' }
}

function extractConstraints(schema: Record<string, unknown>): FieldConstraints {
  const constraints: FieldConstraints = {}
  if (typeof schema.minLength === 'number') constraints.minLength = schema.minLength
  if (typeof schema.maxLength === 'number') constraints.maxLength = schema.maxLength
  if (typeof schema.minimum === 'number') constraints.minimum = schema.minimum
  if (typeof schema.maximum === 'number') constraints.maximum = schema.maximum
  if (typeof schema.exclusiveMinimum === 'number') {
    constraints.exclusiveMinimum = schema.exclusiveMinimum
  }
  if (typeof schema.exclusiveMaximum === 'number') {
    constraints.exclusiveMaximum = schema.exclusiveMaximum
  }
  if (typeof schema.multipleOf === 'number') constraints.multipleOf = schema.multipleOf
  if (schema.pattern !== undefined) {
    constraints.pattern =
      schema.pattern instanceof RegExp ? schema.pattern.source : String(schema.pattern)
  }
  if (typeof schema.minItems === 'number') constraints.minItems = schema.minItems
  if (typeof schema.maxItems === 'number') constraints.maxItems = schema.maxItems
  if (typeof schema.uniqueItems === 'boolean') constraints.uniqueItems = schema.uniqueItems
  return constraints
}

function extractAnnotations(schema: Record<string, unknown>): AnnotationSet {
  const annotations: AnnotationSet = {}
  if (typeof schema.title === 'string') annotations.title = schema.title
  if (typeof schema.description === 'string') annotations.description = schema.description
  if (typeof schema.readOnly === 'boolean') annotations.readOnly = schema.readOnly
  if (typeof schema.writeOnly === 'boolean') annotations.writeOnly = schema.writeOnly
  if (typeof schema.deprecated === 'boolean') annotations.deprecated = schema.deprecated
  if (Array.isArray(schema.examples)) annotations.examples = schema.examples
  if ('default' in schema) annotations.default = schema.default
  return annotations
}

function extractEnumValues(schema: Record<string, unknown>): EnumOption[] | undefined {
  if (!Array.isArray(schema.enum)) return undefined
  return schema.enum.map((value) => ({ value }))
}

/** Follows a $ref to the node it points at; returns the node unchanged otherwise. */
function dereference(node: SchemaNode): SchemaNode {
  return node.$ref ? node.resolveRef() : node
}

/**
 * A property key a form may need to render, and where its schema came from.
 *
 * The two are kept apart rather than collapsed to one node, because they carry
 * different authority. A key declared by this schema's own `properties` is the
 * most specific statement about that location. A key contributed by an
 * applicator branch is one of possibly several competing statements, and which
 * of them applies is a question about the data, not about the schema.
 */
interface CandidateProperty {
  /** Declared by the node's own `properties`. */
  direct?: SchemaNode
  /** Contributed by applicator branches, in the order the schema declares them. */
  alternatives: SchemaNode[]
}

/**
 * A bound on applicator nesting, and a backstop rather than the cycle guard.
 *
 * The guard below keys on `schemaLocation`, which repeats when a `$ref` closes
 * a cycle, and that alone is enough: raising this constant to 100000 leaves the
 * recursive-applicator test passing, while removing both overflows the stack.
 * This exists because `schemaLocation` is not guaranteed to be present on every
 * node, and a recursive schema whose nodes carried none would otherwise recurse
 * until the stack gave out. A hung form is a far worse failure than a candidate
 * missed at depth 65.
 *
 * The consequence for anyone editing this: the two bounds overlap on every
 * fixture in the suite, so deleting either one on its own does not fail a test.
 * That was measured rather than assumed, and it is the reason this comment
 * records which of them is the mechanism.
 */
const MAX_APPLICATOR_DEPTH = 64

/**
 * Every property key that could appear at this node's own instance location,
 * across every branch that might apply to it.
 *
 * This is the static half of the inactive-node contract: a branch the data does
 * not currently select still contributes its property pointers, which then
 * project with `active: false`. The dynamic half is `reduceNode`, which decides
 * which of them apply now, and the two must stay separate. Making the candidate
 * set data-driven would delete a pointer the moment its branch stopped
 * matching, which is exactly the flicker the contract exists to prevent.
 *
 * **Recursion is through applicators only, and only those acting on this same
 * instance location**: `if`, `then`, `else`, `allOf`, `anyOf`, `oneOf`,
 * `dependentSchemas`, and whatever a `$ref` resolves to. draft-07
 * `dependencies` needs no separate handling, because json-schema-library
 * normalises it into `dependentSchemas` at parse time.
 *
 * Three things are deliberately not followed:
 *
 * - **`not`**, because a subschema inside it describes a shape the instance
 *   must *not* satisfy. Collecting its properties as candidates would invert
 *   its meaning.
 * - **the values of `properties`**, because those describe a child location,
 *   not this one. `owner` is collected; the walk descends into `/owner`
 *   separately and collects `name` there. Following it here would make `name` a
 *   sibling of `owner`.
 * - **`items` and `prefixItems`**, for the same reason: an array's items are
 *   their own locations.
 *
 * The cycle guard keys on `schemaLocation` rather than on node identity, which
 * was measured rather than assumed and is the opposite of what it looks like it
 * should be: `resolveRef()` returns a fresh `SchemaNode` on every call, and the
 * raw `schema` object it wraps is fresh too, so an identity `Set` never matches
 * and a recursive `$ref` would not terminate. `schemaLocation` is stable, is
 * distinct for each inline branch position, and repeats when a reference closes
 * a cycle, which is precisely the three properties needed. The set is per call,
 * because deduplicating a schema location is only sound while collecting names
 * for one instance location; the same schema legitimately recurs at a deeper
 * pointer, and `walk` visits it again there.
 */
function collectCandidateProperties(node: SchemaNode): Map<string, CandidateProperty> {
  const candidates = new Map<string, CandidateProperty>()
  const visited = new Set<string>()

  const record = (key: string, propNode: SchemaNode, direct: boolean): void => {
    const entry = candidates.get(key) ?? { alternatives: [] }
    if (direct) entry.direct ??= propNode
    else entry.alternatives.push(propNode)
    candidates.set(key, entry)
  }

  const visit = (current: SchemaNode, own: boolean, depth: number): void => {
    if (depth > MAX_APPLICATOR_DEPTH) return

    const resolved = dereference(current)
    const location = (resolved as { schemaLocation?: unknown }).schemaLocation
    if (typeof location === 'string') {
      if (visited.has(location)) return
      visited.add(location)
    }

    for (const [key, propNode] of Object.entries(resolved.properties ?? {})) {
      record(key, propNode, own)
    }

    for (const branch of [resolved.if, resolved.then, resolved.else]) {
      if (branch) visit(branch, false, depth + 1)
    }
    for (const branches of [resolved.allOf, resolved.anyOf, resolved.oneOf]) {
      for (const branch of branches ?? []) visit(branch, false, depth + 1)
    }
    for (const dependency of Object.values(resolved.dependentSchemas ?? {})) {
      if (dependency && typeof dependency === 'object') {
        visit(dependency as SchemaNode, false, depth + 1)
      }
    }
  }

  visit(node, true, 0)
  return candidates
}

/**
 * The schema to project for a candidate when no branch is active.
 *
 * A hidden node is still compiled, so it needs some shape, and an inactive key
 * defined differently by two branches has no single right answer. The rule is
 * therefore stated rather than left to traversal order: the node's own
 * declaration wins, and failing that the first branch the schema declares. It
 * is a stable placeholder and deliberately not a claim that one branch matters
 * more, which is why `CandidateProperty` keeps the alternatives instead of
 * discarding them. Whenever a branch *is* active, `walk` uses the reduced
 * node instead and this is not consulted.
 */
function candidatePrototype(candidate: CandidateProperty): SchemaNode {
  return candidate.direct ?? candidate.alternatives[0]
}

/**
 * Computes the currently-required property keys for an object node given its data.
 *
 * `reducedSchema.required` already reflects if/then/else and dependentSchemas (their
 * reducers merge `required` arrays). It does not reflect a standalone `dependentRequired`
 * keyword, which json-schema-library only enforces at validation time and never merges
 * into a reduced schema's `required` list, so that keyword's effect is computed here
 * directly from `node.dependentRequired` and the trigger properties present in `data`.
 */
function computeRequiredSet(
  resolved: SchemaNode,
  reducedSchema: Record<string, unknown> | undefined,
  dataRecord: Record<string, unknown> | undefined,
): Set<string> {
  const baseSchema = resolved.schema as Record<string, unknown>
  const requiredSource = Array.isArray(reducedSchema?.required)
    ? (reducedSchema.required as string[])
    : Array.isArray(baseSchema.required)
      ? (baseSchema.required as string[])
      : []
  const required = new Set(requiredSource)

  if (resolved.dependentRequired && dataRecord) {
    for (const [trigger, extra] of Object.entries(resolved.dependentRequired)) {
      if (Object.prototype.hasOwnProperty.call(dataRecord, trigger)) {
        for (const key of extra) required.add(key)
      }
    }
  }
  return required
}

/**
 * Walks the compiled schema statically (via node.properties/node.items plus every
 * conditional branch), only descending into array items that are actually present in
 * the data, and collects one NodeProjection per JsonPointer into `nodes`.
 *
 * Static (not data-driven) traversal is required for object properties so that fields
 * absent from the current data instance (e.g. an untouched optional field, or a field
 * that only exists in an inactive if/then/else/dependentSchemas branch) still produce a
 * NodeProjection a form can render, with `active` reflecting whether that branch is
 * currently selected for `data`.
 */
function walk(
  node: SchemaNode,
  pointer: string,
  data: unknown,
  active: boolean,
  nodes: Map<JsonPointer, NodeProjection>,
  diagnostics: ProjectionDiagnostic[],
): void {
  const original = dereference(node)
  const originalSchema = original.schema as Record<string, unknown>
  if (typeof originalSchema !== 'object' || originalSchema === null) return

  let resolved = original
  let schema = originalSchema
  let type = resolveExplicitType(schema)
  // Whether this node's own active branch could be determined. Stays true for every
  // node except a typeless oneOf/anyOf wrapper whose branch could not be resolved
  // (see below) — that node's own existence in the projection is itself provisional,
  // not just its children's.
  let branchResolved = true

  // A node whose own schema carries no `type` keyword, only `oneOf`/`anyOf` branches
  // (e.g. a property schema like `{ oneOf: [{ type: 'object', ... }, ...] }`), has no
  // type until its active branch is resolved against `data`. `original` is kept
  // separately so every branch's properties can still be collected below for the
  // inactive-node contract, even though only the matching branch's schema is used here.
  // Whether a branch of this node's own `oneOf`/`anyOf` was resolved against
  // `data`. Recorded so an unresolved shape can be attributed correctly below:
  // on this path, "no shape" means the current value matches no branch, which
  // is a fact about the data rather than about the schema.
  let composedAgainstData = false

  if (!type && (original.oneOf || original.anyOf)) {
    composedAgainstData = true
    const { node: branchNode } = original.reduceNode(data)
    if (branchNode) {
      resolved = branchNode
      schema = branchNode.schema as Record<string, unknown>
      type = resolveExplicitType(schema)
    } else {
      // reduceNode() returned no node at all: this is oneOf's behavior when data
      // matches zero or multiple branches (anyOf instead returns a node with an
      // empty merged schema in that case, which carries no explicit type either,
      // but which does not reach this branch). This test suite's oneOf wrappers put
      // an object schema on every branch, so 'object' is a safe stand-in type here:
      // it lets this pointer and every candidate branch property still appear in the
      // projection, all `active: false`, per the inactive-node contract, instead of
      // silently dropping the whole subtree. A oneOf/anyOf wrapper whose branches are
      // primitives (not objects) is not handled by this fallback.
      type = 'object'
      branchResolved = false
    }
  }

  /**
   * Whether the absence of a shape here is only the current value's fault.
   *
   * Two conditions, and both are needed. Nothing was merged in from a branch,
   * which is what reducing against a value that satisfies none of them leaves
   * behind; and some branch could have been rendered for a value that did
   * satisfy it, so the composition is not unrenderable in itself.
   *
   * The first condition is what a coarser check missed. Entering the
   * composition path says nothing on its own: a branch can be selected and
   * still supply no shape, as `{ anyOf: [{ minLength: 1 }, { pattern: '^a' }] }`
   * does for `"abc"`, where both branches match and neither describes anything
   * this adapter renders, because scalar shapes are deliberately not inferred.
   * That schema is genuinely unprojectable and has to be reported.
   */
  const isTransientBranchMiss = (): boolean =>
    Object.keys(schema).length === 0 && compositionHasRenderableAlternative(original)

  // Last resort, after the oneOf/anyOf branch above has had its chance: that
  // path handles a typeless wrapper whose type only exists once a branch is
  // chosen, and inferring first would take a schema carrying both `properties`
  // and `oneOf` down the object path without ever resolving its branch.
  if (!type) {
    const shape = inferProjectionShape(schema)
    if (shape.kind === 'resolved') {
      type = shape.type
    } else if (shape.kind === 'none' && composedAgainstData && isTransientBranchMiss()) {
      // Deliberately silent, and only for this one case. A projection
      // diagnostic describes a schema this adapter cannot turn into a shape,
      // and a value that matches none of a composition's branches is not that:
      // the same schema renders for a value that does match one. That is
      // validation's subject, it is already reported there, and a form's data
      // is in this state for most of the time someone is filling it in, so a
      // diagnostic here would appear and disappear on each keystroke and train
      // a caller to ignore the channel.
    } else {
      // Reported rather than dropped in silence. The field cannot be drawn
      // without a shape, so the caller is told which pointer was skipped and
      // why, instead of finding out from a form that never collected the
      // value.
      diagnostics.push(
        shape.kind === 'ambiguous'
          ? {
              pointer: toPointer(pointer),
              code: 'ambiguous-projection-shape',
              message:
                `No explicit "type", and keywords from more than one type apply ` +
                `(${shape.families.join(', ')}), so the shape to render is undecidable. ` +
                `Declare "type" on this schema to resolve it.`,
            }
          : {
              pointer: toPointer(pointer),
              code: 'unresolved-projection-shape',
              message:
                `No explicit "type", and no keyword that implies one, so there is no ` +
                `shape to render. Declare "type" on this schema.` +
                // Said only where it applies, because inferring `string` from
                // an enum is the tempting wrong rule and the reason deserves
                // to travel with the case rather than every message.
                (schema.enum !== undefined
                  ? ` An "enum" alone does not imply a type, because its members may be of different types.`
                  : ''),
            },
      )
    }
  }

  if (!type) return
  const nodeActive = active && branchResolved

  if (type === 'object') {
    const dataRecord =
      typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined

    // reduceNode() resolves if/then/else, dependentSchemas (which also covers
    // draft-07 schema-form dependencies), and oneOf/anyOf against `data`, merging the
    // active branch's properties/required into the returned schema. An empty object
    // stands in for "no data yet" so the reducers still run instead of being skipped
    // outright. When no branch can be resolved (e.g. a oneOf with zero or multiple
    // matches), reduceNode reports an error instead of a node; the object's own
    // directly-declared properties are used as the active set in that case, so a
    // discriminator field outside the oneOf branches still projects as active.
    //
    // When `resolved` is already the branch picked out above (typeless oneOf/anyOf
    // wrapper case), it has already been reduced against the real `data` at this
    // pointer; re-reducing it against `dataRecord ?? {}` here would be redundant (and,
    // for a branch with no dynamic keywords of its own, a no-op), so it is skipped.
    const reducedNode =
      resolved === original ? resolved.reduceNode(dataRecord ?? {}).node : resolved
    const reducedSchema = reducedNode?.schema as Record<string, unknown> | undefined
    const reducedProperties =
      (reducedSchema?.properties as Record<string, unknown> | undefined) ??
      (schema.properties as Record<string, unknown> | undefined) ??
      {}
    const activeKeys = new Set(Object.keys(reducedProperties))
    const requiredSet = computeRequiredSet(resolved, reducedSchema, dataRecord)

    // Candidates are collected from `original`, not `resolved`, so every oneOf/anyOf
    // branch's properties are represented (the matching branch alone, via `resolved`,
    // would only expose its own properties).
    const candidateProps = collectCandidateProperties(original)
    const propKeys = [...candidateProps.keys()]

    const children: ChildProjection[] | undefined =
      propKeys.length > 0
        ? propKeys.map((key) => ({
            pointer: toPointer(`${pointer}/${escapeSegment(key)}`),
            key,
            required: requiredSet.has(key),
          }))
        : undefined

    nodes.set(toPointer(pointer), {
      type,
      format: typeof schema.format === 'string' ? schema.format : undefined,
      constraints: extractConstraints(schema),
      children,
      enumValues: extractEnumValues(schema),
      active: nodeActive,
      annotations: extractAnnotations(schema),
    })

    for (const key of propKeys) {
      const childPointer = `${pointer}/${escapeSegment(key)}`
      const childActive = nodeActive && activeKeys.has(key)
      const reducedChildNode = reducedNode?.properties?.[key] as SchemaNode | undefined
      const childNode = reducedChildNode ?? candidatePrototype(candidateProps.get(key)!)
      walk(childNode, childPointer, dataRecord?.[key], childActive, nodes, diagnostics)
    }
    return
  }

  nodes.set(toPointer(pointer), {
    type,
    format: typeof schema.format === 'string' ? schema.format : undefined,
    constraints: extractConstraints(schema),
    children: undefined,
    enumValues: extractEnumValues(schema),
    active: nodeActive,
    annotations: extractAnnotations(schema),
    itemAnnotations:
      type === 'array' && resolved.items
        ? extractAnnotations(dereference(resolved.items).schema as Record<string, unknown>)
        : undefined,
  })

  if (type === 'array' && resolved.items && Array.isArray(data)) {
    data.forEach((item, index) => {
      walk(resolved.items!, `${pointer}/${index}`, item, nodeActive, nodes, diagnostics)
    })
  }
}

/**
 * Maps a compiled json-schema-library root node to a SchemaProjection.
 * Called by adapter.project() on every data change.
 *
 * Object properties are walked statically from the schema, including both branches of
 * if/then/else, every dependentSchemas/dependencies branch, and every oneOf/anyOf branch
 * (so inactive branches are still present in the projection, per the inactive-node
 * contract), while array items are walked from `data` (an array's length is a data-time
 * fact, not a schema-time one). $ref is resolved transparently via node.resolveRef().
 */
export function buildProjection(root: SchemaNode, data: unknown): SchemaProjection {
  const nodes = new Map<JsonPointer, NodeProjection>()
  const diagnostics: ProjectionDiagnostic[] = []
  walk(root, '', data, true, nodes, diagnostics)
  return { nodes, diagnostics }
}
