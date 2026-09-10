import type { JsonPointer } from '../types.js'
import { isArrayIndexSegment, parsePointer } from '../json-pointer.js'

/**
 * The initialization pass from ADR-003, over a normalized view of a schema
 * rather than a `SchemaProjection`.
 *
 * Nothing here is exported from the package. ADR-003 is Proposed, and its rule
 * 5 turns on what "reachable" means for a provisionally selected branch, which
 * issue #120 has not settled. Until it does, this exists to be executed and
 * tested rather than to be called: wiring it to a real projection or publishing
 * `FormRuntimeOptions.initialization` would ship the undecided part.
 *
 * The input is a function of a data snapshot, so the caller decides what
 * applies to the instance as it stands. That keeps the algorithm testable
 * without committing to how a port will eventually supply the information,
 * which is issue #128.
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

/** One `default` declaration that applies at a location. */
export interface DefaultCandidate {
  readonly value: unknown
  /**
   * Opaque, and only ever compared or reported. It exists so a disagreement can
   * name which declarations disagreed rather than only that some did.
   */
  readonly sourceId: string
}

/** What applies to one data snapshot. */
export interface InitializationView {
  /** Locations the schema exposes for the instance as it stands. */
  readonly reachable: ReadonlySet<Location>
  readonly defaults: ReadonlyMap<Location, readonly DefaultCandidate[]>
}

export type ProjectView = (data: unknown) => InitializationView

/** Two or more applicable declarations that do not agree. */
export interface DefaultConflict {
  readonly location: Location
  readonly sourceIds: readonly string[]
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

  for (const location of view.reachable) {
    const declarations = view.defaults.get(location)
    if (!declarations || declarations.length === 0) continue

    const segments = parsePointer(location)
    if (!isAbsent(data, segments)) continue

    const refusal = refuse(data, segments)
    if (refusal !== undefined) {
      refusals.push({ location, reason: refusal })
      continue
    }

    const resolved = resolve(declarations)
    if (resolved === undefined) {
      conflicted.add(location)
      conflicts.push({ location, sourceIds: declarations.map((d) => d.sourceId) })
      continue
    }
    candidates.push({ segments, value: resolved.value })
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

/** One declaration, or several that agree, resolve. Several that differ do not. */
function resolve(declarations: readonly DefaultCandidate[]): DefaultCandidate | undefined {
  const [first, ...rest] = declarations
  return rest.every((other) => deepEqual(other.value, first!.value)) ? first : undefined
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
      return isArrayIndexSegment(segments[index]!) ? 'unknown-container-kind' : undefined
    }
    if (!isContainer(current)) return 'non-container-ancestor'
    if (index === segments.length - 1) return undefined
    current = (current as Record<string, unknown>)[segments[index]!]
  }
  return undefined
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
