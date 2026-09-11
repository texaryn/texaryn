import { mergeNode, type SchemaNode } from 'json-schema-library'
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

function extractAnnotations(
  schema: Record<string, unknown>,
  /**
   * Set where two declarations apply to this location whatever the instance is
   * and disagree. The merged schema still carries one of them, and which one is
   * the merge's traversal order rather than an answer.
   */
  omitDefault = false,
): AnnotationSet {
  const annotations: AnnotationSet = {}
  if (typeof schema.title === 'string') annotations.title = schema.title
  if (typeof schema.description === 'string') annotations.description = schema.description
  if (typeof schema.readOnly === 'boolean') annotations.readOnly = schema.readOnly
  if (typeof schema.writeOnly === 'boolean') annotations.writeOnly = schema.writeOnly
  if (typeof schema.deprecated === 'boolean') annotations.deprecated = schema.deprecated
  if (Array.isArray(schema.examples)) annotations.examples = schema.examples
  if (!omitDefault && 'default' in schema) annotations.default = schema.default
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
 * The position of a schema within the document it was authored in, as a JSON
 * Pointer with the root as the empty string.
 *
 * `schemaLocation` is already that, prefixed with the `#` of a URI fragment,
 * and it names what a `$ref` resolves to rather than the reference. Both
 * adapters report sources in this form so a diagnostic means the same thing
 * whichever one produced it.
 */
function documentPointer(node: SchemaNode): string {
  const location = (node as { schemaLocation?: unknown }).schemaLocation
  return typeof location === 'string' ? location.replace(/^#/, '') : ''
}

/** One `default` declaration, and the schema position that makes it. */
interface DefaultDeclaration {
  value: unknown
  source: string
}

/**
 * Visits every schema position that applies to one location whatever the
 * instance is.
 *
 * The edges followed are the unconditional ones: a schema's own keywords, its
 * `allOf` branches, and whatever a `$ref` resolves to. Nothing about an
 * instance can make one of those not apply, so two of them declaring different
 * values is a fact about the schema and there is no instance that resolves it.
 *
 * `oneOf`, `anyOf`, `if`/`then`/`else` and `dependentSchemas` are deliberately
 * not followed, and not because their conflicts are less real. A declaration
 * one of them carries competes with the base only while its branch is
 * selected, so whether the disagreement holds is a state of the data, and
 * `SchemaProjection.diagnostics` carries facts about schemas. Reporting it
 * there would mean a diagnostic that appears and disappears as a discriminator
 * is typed.
 *
 * `roots` is a set rather than one node because a location can be declared in
 * several places at once: `properties/x` on the node's own schema and on each
 * of its `allOf` branches are all declarations of the same location.
 */
function eachUnconditional(
  roots: readonly SchemaNode[],
  visitor: (node: SchemaNode) => void,
): void {
  const visited = new Set<string | SchemaNode>()

  const visit = (current: SchemaNode): void => {
    const resolved = dereference(current)
    // The same guard, and for the same measured reason, as
    // `collectCandidateProperties`: `resolveRef()` returns a fresh node every
    // call, so identity alone never closes a cycle, and an inline branch has no
    // location of its own to key on.
    const location = (resolved as { schemaLocation?: unknown }).schemaLocation
    const key = typeof location === 'string' ? location : resolved
    if (visited.has(key)) return
    visited.add(key)

    visitor(resolved)
    for (const branch of resolved.allOf ?? []) visit(branch)
  }

  for (const root of roots) visit(root)
}

function collectUnconditionalDefaults(roots: readonly SchemaNode[]): DefaultDeclaration[] {
  const declarations: DefaultDeclaration[] = []
  eachUnconditional(roots, (node) => {
    const schema = node.schema as Record<string, unknown>
    if (schema !== null && typeof schema === 'object' && 'default' in schema) {
      declarations.push({ value: schema.default, source: documentPointer(node) })
    }
  })
  return declarations
}

/** The positions that unconditionally declare one property of `roots`. */
function unconditionalChildren(roots: readonly SchemaNode[], key: string): SchemaNode[] {
  const children: SchemaNode[] = []
  eachUnconditional(roots, (node) => {
    const child = node.properties?.[key] as SchemaNode | undefined
    if (child) children.push(child)
  })
  return children
}

/** The positions that unconditionally declare the elements of `roots`. */
function unconditionalItems(roots: readonly SchemaNode[]): SchemaNode[] {
  const items: SchemaNode[] = []
  eachUnconditional(roots, (node) => {
    if (node.items) items.push(node.items)
  })
  return items
}

/**
 * The declarations to report, or nothing where the schema states one answer.
 *
 * One declaration needs no report, and several that agree state the same
 * answer more than once, which is not a disagreement however many times it is
 * said. Compared by value, as ADR-003's own pass compares them: two branches
 * declaring an equal object have nothing to choose between.
 */
function disagreeingDefaults(
  declarations: readonly DefaultDeclaration[],
): readonly DefaultDeclaration[] | undefined {
  if (declarations.length < 2) return undefined
  const [first, ...rest] = declarations
  return rest.every((other) => deepEqual(other.value, first!.value)) ? undefined : declarations
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
  const visited = new Set<string | SchemaNode>()

  const record = (key: string, propNode: SchemaNode, direct: boolean): void => {
    const entry = candidates.get(key) ?? { alternatives: [] }
    if (direct) entry.direct ??= propNode
    else entry.alternatives.push(propNode)
    candidates.set(key, entry)
  }

  const visit = (current: SchemaNode, own: boolean): void => {
    const resolved = dereference(current)

    // Keyed on `schemaLocation` where there is one, and on the node itself
    // where there is not, which together cover every way the traversal can
    // come back to where it started.
    //
    // Neither alone is sufficient and each covers what the other cannot. A
    // cycle requires a `$ref`, because an inline schema cannot nest into
    // itself, and `resolveRef()` returns a fresh `SchemaNode` on every call
    // whose raw `schema` object is fresh too, so identity never matches across
    // one; those nodes do carry a location. An inline branch is never resolved
    // through a ref, so its identity is stable within one traversal.
    //
    // This deliberately replaced a depth cap. A cap terminates, but it does so
    // by dropping candidates a valid schema declared, which is the silent
    // disappearance the whole projection-diagnostic design exists to prevent:
    // a field nested under 70 applicators is still a field.
    const location = (resolved as { schemaLocation?: unknown }).schemaLocation
    const key = typeof location === 'string' ? location : resolved
    if (visited.has(key)) return
    visited.add(key)

    for (const [key, propNode] of Object.entries(resolved.properties ?? {})) {
      record(key, propNode, own)
    }

    for (const branch of [resolved.if, resolved.then, resolved.else]) {
      if (branch) visit(branch, false)
    }
    for (const branches of [resolved.allOf, resolved.anyOf, resolved.oneOf]) {
      for (const branch of branches ?? []) visit(branch, false)
    }
    for (const dependency of Object.values(resolved.dependentSchemas ?? {})) {
      if (dependency && typeof dependency === 'object') {
        visit(dependency as SchemaNode, false)
      }
    }
  }

  visit(node, true)
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
 * discarding them.
 *
 * Last of three, and only reached when no branch has claimed the location: an
 * active branch gives `walk` the reduced node, and a provisionally selected one
 * gives it `composeChild`, so this is consulted for neither.
 */
function candidatePrototype(candidate: CandidateProperty): SchemaNode {
  return candidate.direct ?? candidate.alternatives[0]
}

/**
 * The two statements that both apply to a child location, as one node.
 *
 * A selected branch beats an unselected sibling, and it does not beat the
 * node's own unconditional declaration: in JSON Schema the two are conjunctive,
 * so the instance has to satisfy both. Replacing in either direction is wrong,
 * and visibly so from the form. Dropping the base constraint makes the form
 * accept what the submission rejects. Dropping the branch's makes an unrelated
 * limit appear from nowhere the moment the branch activates, when all the user
 * supplied was the property that completed it.
 *
 * `mergeNode` is the library's own routine, the one `reduceNode` uses to fold a
 * reducer's result into the node it is building, called here in that same order:
 * base first, branch second, so the branch wins a keyword both sides declare.
 * Matching it is the point. It makes the provisional projection *equal* the
 * active projection of the same branch rather than merely resemble it, which is
 * what a hand-written conjunction could not promise.
 *
 * Both sides are dereferenced first because `mergeNode` carries `$ref` over
 * from the base, and `walk` dereferences whatever it is handed: an unresolved
 * `$ref` on the result would resolve back to the base alone and discard the
 * branch.
 */
function composeChild(base?: SchemaNode, branch?: SchemaNode): SchemaNode | undefined {
  if (!base || !branch) return base ?? branch
  return mergeNode(dereference(base), dereference(branch))
}

/**
 * The `oneOf` branch the current data uniquely identifies, when the evaluator
 * selected none.
 *
 * `oneOf` selects on full validity, so a branch the data plainly identifies
 * stays unselected while one of its own required properties is absent, and
 * hiding it leaves the user no way to supply the property that would make it
 * apply. This picks that branch so a form can expose it, and the node it
 * returns is reported `provisional` rather than `active`: JSON Schema still
 * says the branch does not apply, and that fact is not this function's to
 * overwrite.
 *
 * Deliberately narrow, because a form that guesses is worse than one that shows
 * nothing:
 *
 * - only an explicit `const` or `enum` on a property discriminates, and both
 *   together are conjunctive rather than alternatives
 * - a discriminator has to be present in the data by own-property presence,
 *   never read from a `default` annotation, since a declared default is not a
 *   value anyone supplied
 * - a key discriminates only if every branch constrains it, so branches that
 *   simply differ in shape do not vote
 * - every present discriminator has to agree on one branch
 * - zero or several surviving branches select nothing
 *
 * `type` is excluded: it says almost nothing about intent when every branch is
 * an object. `anyOf` is excluded because several of its branches may apply at
 * once, which is a different question from which one the user means.
 *
 * Nothing else about a branch participates. A branch stays identified when some
 * other constraint of its own fails, or selection would quietly become validity
 * again and the field that completes the branch would stay hidden for a second
 * reason.
 */
function selectProvisionalBranch(
  node: SchemaNode,
  dataRecord: Record<string, unknown> | undefined,
): SchemaNode | undefined {
  const branches = node.oneOf
  if (!branches || branches.length === 0 || dataRecord === undefined) return undefined

  const resolvedBranches = branches.map(dereference)
  const discriminators = [...discriminatorKeys(resolvedBranches)].filter((key) =>
    Object.prototype.hasOwnProperty.call(dataRecord, key),
  )
  if (discriminators.length === 0) return undefined

  const accepted = resolvedBranches.filter((branch) =>
    discriminators.every((key) => branchAccepts(branch, key, dataRecord[key])),
  )
  return accepted.length === 1 ? accepted[0] : undefined
}

/** Keys every branch constrains with `const` or `enum`. */
function discriminatorKeys(branches: readonly SchemaNode[]): Set<string> {
  const first = branches[0]
  if (!first) return new Set()
  const shared = new Set(
    Object.keys((first.schema as Record<string, unknown>).properties ?? {}).filter((key) =>
      isDiscriminator(first, key),
    ),
  )
  for (const branch of branches.slice(1)) {
    for (const key of [...shared]) {
      if (!isDiscriminator(branch, key)) shared.delete(key)
    }
  }
  return shared
}

function discriminatorSchema(
  branch: SchemaNode,
  key: string,
): Record<string, unknown> | undefined {
  const property = branch.properties?.[key]
  if (!property) return undefined
  return dereference(property).schema as Record<string, unknown>
}

function isDiscriminator(branch: SchemaNode, key: string): boolean {
  const schema = discriminatorSchema(branch, key)
  if (!schema) return false
  return 'const' in schema || Array.isArray(schema.enum)
}

/** `const` and `enum` are separate constraints, so a value has to satisfy both. */
function branchAccepts(branch: SchemaNode, key: string, value: unknown): boolean {
  const schema = discriminatorSchema(branch, key)
  if (!schema) return false
  if ('const' in schema && !deepEqual(schema.const, value)) return false
  if (Array.isArray(schema.enum) && !schema.enum.some((member) => deepEqual(member, value))) {
    return false
  }
  return true
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const left = Object.keys(a)
    const right = Object.keys(b)
    return (
      left.length === right.length &&
      left.every(
        (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]),
      )
    )
  }
  return false
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
  /**
   * Whether an ancestor's provisionally selected branch exposes this node. A
   * node is never both: `active` is what the schema says, and this is what the
   * projection selected so the user can complete it.
   */
  provisional: boolean,
  nodes: Map<JsonPointer, NodeProjection>,
  diagnostics: ProjectionDiagnostic[],
  /**
   * The schema positions that declare this location whatever the instance is,
   * which `node` alone cannot supply: by the time the caller has a node to walk
   * it holds the merge of them, and the merge is what loses a disagreement.
   */
  declaredAt: readonly SchemaNode[],
): void {
  const original = dereference(node)
  const originalSchema = original.schema as Record<string, unknown>
  if (typeof originalSchema !== 'object' || originalSchema === null) return

  let resolved = original
  let schema = originalSchema
  let type = resolveExplicitType(schema)
  // Whether this node's own active branch could be determined. Stays true for every
  // node except a typeless oneOf/anyOf wrapper whose branch could not be resolved
  // (see below), where the node's own presence in the projection is the thing in
  // doubt rather than only its children's.
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
  /**
   * Whether a typeless wrapper's branch was picked by the discriminator rather
   * than by the evaluator. The wrapper is then shown provisionally: the schema
   * still applies no branch, and that is what `active` reports.
   */
  let wrapperIdentified = false

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
      // The wrapper's own branch could not be resolved, so the schema applies
      // none of them. It may still be identifiable: a discriminator present in
      // the data picks one, and the wrapper is then exposed provisionally
      // rather than not at all. Without that, the same schema behaves
      // differently for having declared `type` or not, since the typed path
      // reaches the selector below and this one used to stop here.
      //
      // Only the flag is recorded, deliberately. Assigning the branch to
      // `resolved` erases the difference between what the evaluator resolved
      // and what this projection selected, and the object path reads `resolved`
      // as the former: it would take the branch's `required` as active
      // requiredness, find `nodeActive` false because no branch applies, and
      // report the field as neither required nor provisionally required.
      // Left alone, that path selects the same branch through
      // `selectProvisionalBranch` and attributes it to the right one of the two.
      //
      // Gated on this node already being exposed, for the reason the object
      // path is: selection is local, exposure is the ancestor's to grant.
      wrapperIdentified =
        (active || provisional) &&
        selectProvisionalBranch(
          original,
          typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined,
        ) !== undefined
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

  // Reported at the location it is about, and after the shape gate above: a
  // pointer with no node has nothing to omit an annotation from, and saying
  // that its `default` is undecidable on top of saying it cannot be drawn at
  // all would be the same schema reported twice.
  const ambiguousDefault = disagreeingDefaults(collectUnconditionalDefaults(declaredAt))
  if (ambiguousDefault) {
    diagnostics.push({
      pointer: toPointer(pointer),
      code: 'ambiguous-default',
      message:
        `${ambiguousDefault.length} "default" declarations apply here whatever the ` +
        `instance is, and they disagree, so there is no value to report. Declare one ` +
        `of them, or make them equal.`,
      sources: ambiguousDefault.map((declaration) => declaration.source),
    })
  }

  const nodeActive = active && branchResolved
  // A node the schema applies is never also provisional; the two report
  // different facts and only the second is a choice this projection made. The
  // `!nodeActive` term is belt and braces: `provisional` only ever arrives true
  // from a parent that computed `!childActive`, so no caller can reach here
  // with both, and dropping the term changes no observable behaviour.
  const nodeProvisional = !nodeActive && (provisional || wrapperIdentified) && (branchResolved || wrapperIdentified)
  // Whether a form shows this node at all, which is what a descendant inherits.
  const nodeExposed = nodeActive || nodeProvisional

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

    // Two conditions, and they are not the same kind of condition.
    //
    // Exposure is load-bearing. Selection is local, but whether this node is
    // shown at all is its ancestors' to decide, and a subtree nothing exposes
    // must not select a branch off data it happens to retain: the compiler
    // collapses `required || provisionalRequired` into the one flag a binding
    // reads, so a hidden field would acquire a requirement.
    //
    // The evaluator having selected nothing is where provisional selection
    // exists to help, and that half is unobservable rather than wrong: a
    // resolved branch is fully valid, so it accepts every present discriminator
    // and the selector would return that same branch, whose keys are already
    // the active set. Kept because doing the work is pointless and the
    // condition states the intent.
    const provisionalBranch =
      nodeExposed && reducedNode === undefined
        ? selectProvisionalBranch(original, dataRecord)
        : undefined
    const provisionalSchema = provisionalBranch?.schema as Record<string, unknown> | undefined
    const provisionalKeys = new Set(
      Object.keys((provisionalSchema?.properties as Record<string, unknown> | undefined) ?? {}),
    )
    const provisionalRequired = new Set(
      Array.isArray(provisionalSchema?.required) ? (provisionalSchema.required as string[]) : [],
    )

    // Candidates are collected from `original`, not `resolved`, so every oneOf/anyOf
    // branch's properties are represented (the matching branch alone, via `resolved`,
    // would only expose its own properties).
    const candidateProps = collectCandidateProperties(original)
    const propKeys = [...candidateProps.keys()]

    const children: ChildProjection[] | undefined =
      propKeys.length > 0
        ? propKeys.map((key) => {
            // Gated on the node applying at all. A branch that does not apply
            // demands nothing, so reporting its `required` array as a
            // requirement would attribute to the validator something it is not
            // asking for.
            const required = nodeActive && requiredSet.has(key)
            return {
              pointer: toPointer(`${pointer}/${escapeSegment(key)}`),
              key,
              required,
              provisionalRequired: !required && provisionalRequired.has(key) ? true : undefined,
            }
          })
        : undefined

    nodes.set(toPointer(pointer), {
      type,
      format: typeof schema.format === 'string' ? schema.format : undefined,
      constraints: extractConstraints(schema),
      children,
      enumValues: extractEnumValues(schema),
      active: nodeActive,
      provisional: nodeProvisional ? true : undefined,
      annotations: extractAnnotations(schema, ambiguousDefault !== undefined),
    })

    for (const key of propKeys) {
      const childPointer = `${pointer}/${escapeSegment(key)}`
      const childActive = nodeActive && activeKeys.has(key)
      // A descendant inherits exposure, not activity: under a provisionally
      // selected ancestor its own locally applicable properties are
      // provisional too, while a locally inactive one stays inactive.
      const childProvisional =
        !childActive && nodeExposed && (activeKeys.has(key) || provisionalKeys.has(key))
      const reducedChildNode = reducedNode?.properties?.[key] as SchemaNode | undefined
      // Precedence matters as much as the selection does. Marking the right
      // branch provisional while taking its shape from `candidatePrototype`,
      // which is first-wins across branches, would render another branch's
      // widget and annotations under the selected branch's name, and would hand
      // ADR-003's pass another branch's `default`.
      const provisionalChildNode = provisionalBranch?.properties?.[key] as SchemaNode | undefined
      const candidate = candidateProps.get(key)!
      // Three states, in order of authority. What the evaluator reduced against
      // the data is the schema as it actually applies. Failing that, the node's
      // own declaration composed with the selected branch, which is what the
      // reduction would have produced had the branch been complete. Failing
      // both, a stated placeholder for a location no branch has claimed.
      const childNode =
        reducedChildNode ??
        composeChild(candidate.direct, provisionalChildNode) ??
        candidatePrototype(candidate)
      walk(
        childNode,
        childPointer,
        dataRecord?.[key],
        childActive,
        childProvisional,
        nodes,
        diagnostics,
        unconditionalChildren([original], key),
      )
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
    provisional: nodeProvisional ? true : undefined,
    annotations: extractAnnotations(schema, ambiguousDefault !== undefined),
    itemAnnotations:
      type === 'array' && resolved.items
        ? extractAnnotations(dereference(resolved.items).schema as Record<string, unknown>)
        : undefined,
  })

  if (type === 'array' && resolved.items && Array.isArray(data)) {
    const itemPositions = unconditionalItems([original])
    data.forEach((item, index) => {
      walk(
        resolved.items!,
        `${pointer}/${index}`,
        item,
        nodeActive,
        nodeProvisional,
        nodes,
        diagnostics,
        itemPositions,
      )
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
  walk(root, '', data, true, false, nodes, diagnostics, [root])
  return { nodes, diagnostics }
}
