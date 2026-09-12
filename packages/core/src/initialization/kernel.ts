import type { JsonPointer } from '../types.js'
import { parsePointer } from '../json-pointer.js'

/**
 * The initialization pass from ADR-003, over a normalized view of a schema
 * rather than a `SchemaProjection`.
 *
 * Nothing here is exported from the package. ADR-003 is Proposed, and moving it
 * to Accepted is a decision rather than a consequence of the port being able to
 * express it, so publishing `FormRuntimeOptions.initialization` would ship a
 * contract nobody has accepted.
 *
 * The input stays a normalized view now that the port can supply one, because
 * the two are different questions. What a projection says is `view.ts`, which
 * is small and entirely about translation; what the pass does with it is here,
 * and is the part ADR-003 argues.
 *
 * The view is a function of a data snapshot, so what applies is re-asked after
 * every write. Rule 4 needs that: a default can reveal a branch whose own
 * defaults were not reachable before it was written.
 */

/**
 * Where a default applies, as a JSON Pointer.
 *
 * A pointer is enough here because the pass carries no materialization history
 * across edits: a location is an address within one snapshot, not the identity
 * of a row over time. Persistent per-location state, if a later revision of the
 * contract needs it, has to use core's stable item identity instead, because
 * removing a row renumbers the pointers of the rows after it.
 */
export type Location = JsonPointer

/**
 * What applies to one data snapshot.
 *
 * This is what a `SchemaProjection` says, restated as the three things the pass
 * reads. A location appears in at most one of `defaults` and `conflicts`, which
 * the port guarantees: it omits `AnnotationSet.default` exactly where it reports
 * `ambiguous-default`.
 */
export interface InitializationView {
  /** Locations the schema exposes for the instance as it stands. */
  readonly reachable: ReadonlySet<Location>
  /** The one value declared at a location, where the schema declares one. */
  readonly defaults: ReadonlyMap<Location, unknown>
  /**
   * Locations where declarations that apply whatever the instance is disagree,
   * mapped to the schema positions that disagreed.
   *
   * Carried separately rather than as a list of candidates, because the port
   * reports the disagreement without reporting the values: there is no merged
   * value it could give, which is why it omits the annotation. Resolving
   * declarations is therefore the port's job and not this pass's, and the pass
   * needs only the fact, to leave the location alone and to stop a descendant
   * creating it.
   */
  readonly conflicts: ReadonlyMap<Location, readonly string[]>
}

export type ProjectView = (data: unknown) => InitializationView

/** Two or more applicable declarations that do not agree. */
export interface DefaultConflict {
  readonly location: Location
  /** The schema positions that disagreed, as the port reported them. */
  readonly sources: readonly string[]
}

/**
 * A default the pass declined to apply. Reported rather than skipped, because an
 * absent location that nothing explains is the failure mode the applicator depth
 * cap in #118 taught against.
 */
export interface DefaultRefusal {
  readonly location: Location
  readonly reason:
    /** An ancestor holds a scalar, so writing would destroy it. */
    | 'non-container-ancestor'
    /** An ancestor is absent and the pointer does not say what kind of container it is. */
    | 'unknown-container-kind'
}

export type InitializationResult =
  | {
      readonly outcome: 'initialized'
      readonly data: unknown
      /** Locations left absent because their declarations disagreed. */
      readonly conflicts: readonly DefaultConflict[]
      /** Locations left absent because the pass would have had to guess or destroy. */
      readonly refusals: readonly DefaultRefusal[]
      readonly passes: number
    }
  /**
   * Nothing was written. ADR-003 makes exhaustion transactional: keeping the
   * partial writes would make the resulting data depend on the budget, which is
   * an arbitrary number.
   */
  | { readonly outcome: 'budget-exhausted'; readonly passes: number }

export interface InitializeOptions {
  /**
   * A recursive schema can keep revealing locations, so passes are bounded.
   * Monotonicity alone does not terminate: it only guarantees that a pass
   * writing nothing is the end.
   */
  readonly maxPasses?: number
}

const DEFAULT_MAX_PASSES = 32

export function initializeDefaults(
  data: unknown,
  view: ProjectView,
  options: InitializeOptions = {},
): InitializationResult {
  const maxPasses = options.maxPasses ?? DEFAULT_MAX_PASSES
  let current = data

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const { writes, conflicts, refusals } = collect(current, view(current))
    if (writes.length === 0) {
      return { outcome: 'initialized', data: current, conflicts, refusals, passes: pass }
    }
    for (const write of writes) {
      current = writeAtSegments(current, write.segments, deepCopy(write.value))
    }
  }

  return { outcome: 'budget-exhausted', passes: maxPasses }
}

interface Write {
  readonly segments: readonly string[]
  readonly value: unknown
}

function collect(
  data: unknown,
  view: InitializationView,
): { writes: Write[]; conflicts: DefaultConflict[]; refusals: DefaultRefusal[] } {
  const candidates: Write[] = []
  const conflicts: DefaultConflict[] = []
  const refusals: DefaultRefusal[] = []
  const conflicted = new Set<Location>()

  // Both loops are over `reachable`, and both skip a location that is already
  // filled. A conflict at a location holding a value explains nothing: the pass
  // was not going to write there anyway, and reporting it would say a value was
  // withheld that the data already has.
  //
  // A conflicted ancestor is found through this same set rather than a wider
  // one, because exposure is inherited: a location the projection exposes has
  // ancestors it also exposes, in both adapters. The one exception is an
  // adapter that projects a node whose parent it dropped, which is #116, and
  // there the ancestor has no node and so no diagnostic either.
  for (const [location, sources] of view.conflicts) {
    if (!view.reachable.has(location)) continue
    if (!isAbsent(data, parsePointer(location))) continue
    conflicted.add(location)
    conflicts.push({ location, sources })
  }

  for (const location of view.reachable) {
    if (!view.defaults.has(location)) continue

    const segments = parsePointer(location)
    if (!isAbsent(data, segments)) continue

    const refusal = refuse(data, segments)
    if (refusal !== undefined) {
      refusals.push({ location, reason: refusal })
      continue
    }

    candidates.push({ segments, value: view.defaults.get(location) })
  }

  // A container default is materialised whole and recursed into on a later
  // pass, so a descendant write in this pass would be the precedence rule the
  // whole-value decision exists to avoid.
  const withoutDescendants = candidates.filter(
    (write) => !candidates.some((other) => isStrictDescendant(write.segments, other.segments)),
  )

  // A conflict produces no write, so the filter above has nothing to shadow a
  // descendant against, and creating the parent would materialise the location
  // the conflict said to leave absent.
  const writes = withoutDescendants.filter(
    (write) => !hasConflictedAbsentAncestor(data, write.segments, conflicted),
  )

  return { writes, conflicts, refusals }
}

/**
 * Absent means the property is not there. `false`, `0`, `''` and `null` are
 * values, and so is a key present holding `undefined`: telling that last one
 * from a missing key is the whole reason this cannot use `getAtPointer`, which
 * returns `undefined` for both.
 */
function isAbsent(data: unknown, segments: readonly string[]): boolean {
  if (segments.length === 0) return data === undefined
  let current: unknown = data
  for (const segment of segments.slice(0, -1)) {
    if (!isContainer(current)) return true
    current = (current as Record<string, unknown>)[segment]
  }
  if (!isContainer(current)) return true
  return !Object.prototype.hasOwnProperty.call(current, segments[segments.length - 1]!)
}

/**
 * Why a write cannot be applied, or `undefined` when it can.
 *
 * An absent ancestor is created as an object. An ancestor holding a scalar is
 * refused, because writing through it would spread the scalar into character
 * keys, which is the corruption issue #124 records at the root. An absent
 * ancestor whose next segment could be an array index is also refused: a
 * pointer does not say whether `0` addresses the first element of an array or a
 * property literally named `0`, so creating the container would mean guessing,
 * and ADR-003 leaves array rows to whatever #120 and identity keys settle.
 */
function refuse(data: unknown, segments: readonly string[]): DefaultRefusal['reason'] | undefined {
  let current: unknown = data
  for (let index = 0; index < segments.length; index += 1) {
    // `current` is the container that has to hold `segments[index]`.
    if (current === undefined) {
      return couldBeArrayIndex(segments[index]!) ? 'unknown-container-kind' : undefined
    }
    if (!isContainer(current)) return 'non-container-ancestor'
    if (index === segments.length - 1) return undefined
    current = (current as Record<string, unknown>)[segments[index]!]
  }
  return undefined
}

/**
 * Whether a segment could be an array index, in canonical form so `01` and
 * `1x` are ordinary keys. The pass refuses to create a container it cannot
 * name; `setAtPointer` makes the opposite choice and always creates an object,
 * because it is writing what a user typed rather than manufacturing a default.
 */
function couldBeArrayIndex(segment: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(segment)
}

function hasConflictedAbsentAncestor(
  data: unknown,
  segments: readonly string[],
  conflicted: ReadonlySet<Location>,
): boolean {
  return properAncestors(segments).some(
    (ancestor) => conflicted.has(ancestor.location) && isAbsent(data, ancestor.segments),
  )
}

/**
 * Every location strictly above this one, root first.
 *
 * The root is an ancestor of everything except itself, so a conflict there has
 * to stop the pass reaching through it exactly as a conflict one level down
 * does. Leaving the root out let a root conflict be defeated by any child
 * default.
 */
function properAncestors(
  segments: readonly string[],
): { location: Location; segments: readonly string[] }[] {
  if (segments.length === 0) return []
  const ancestors = [{ location: '' as Location, segments: [] as readonly string[] }]
  for (let length = 1; length < segments.length; length += 1) {
    const prefix = segments.slice(0, length)
    ancestors.push({ location: encodePointer(prefix), segments: prefix })
  }
  return ancestors
}

/**
 * Rebuilds a pointer from decoded segments.
 *
 * `parsePointer` decodes `~1` to `/` and `~0` to `~`, so joining its results
 * with `/` again would turn a property named `b/c` into two levels and let a
 * property containing `~1` be read back as an escape. Everything internal
 * therefore travels as segments, and this exists only where a `Location` has to
 * be compared against the caller's own keys.
 */
function encodePointer(segments: readonly string[]): Location {
  return segments
    .map((segment) => `/${segment.replace(/~/g, '~0').replace(/\//g, '~1')}`)
    .join('') as Location
}

function isStrictDescendant(candidate: readonly string[], of: readonly string[]): boolean {
  return candidate.length > of.length && of.every((segment, index) => candidate[index] === segment)
}

function isContainer(value: unknown): boolean {
  return typeof value === 'object' && value !== null
}

/**
 * Sets a value, creating every missing object level on the way.
 *
 * `setAtPointer` now does the same thing, since #129 fixed the defect this was
 * written around: it created exactly one missing level and threw on two. This
 * stays because the pass carries parsed segments rather than pointers, and
 * because `refuse` has already established what `setAtPointer` re-checks, that
 * nothing on the path is a scalar and that no missing level would have to be an
 * array. Collapsing the two is worth doing when the pass stops being a
 * prototype, not while its diagnostics still depend on refusing before writing.
 */
function writeAtSegments(data: unknown, segments: readonly string[], value: unknown): unknown {
  if (segments.length === 0) return value

  const [head, ...rest] = segments
  const child = isContainer(data) ? (data as Record<string, unknown>)[head!] : undefined
  const written = rest.length === 0 ? value : writeAtSegments(child, rest, value)

  if (Array.isArray(data)) {
    const copy = [...data]
    copy[Number(head)] = written
    return copy
  }
  return { ...(isContainer(data) ? (data as Record<string, unknown>) : {}), [head!]: written }
}

/**
 * A declaration is copied on every use, so two rows filled from one schema
 * share no mutable identity with each other or with the schema. Anything that
 * is not a plain object or array comes back as it is, which is correct for the
 * JSON values a `default` can hold.
 */
function deepCopy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepCopy)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, deepCopy(v)]))
  }
  return value
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isContainer(a) && isContainer(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const left = Object.keys(a as object)
    const right = Object.keys(b as object)
    return (
      left.length === right.length &&
      left.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(b, key) &&
          deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
      )
    )
  }
  return false
}
