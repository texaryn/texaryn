import type { JsonPointer } from '../types.js'
import { parsePointer } from '../json-pointer.js'

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
 * Where a default applies.
 *
 * The prototype addresses locations by JSON Pointer, which is enough for
 * objects and wrong for array rows: removing a row renumbers the pointers of
 * the rows after it, so a pointer does not identify a row across edits. Core
 * already has `IdentityKey` for that, and production has to use it. Recorded
 * here rather than worked around, because the pass below never removes a row
 * and so cannot observe the difference.
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

export type InitializationResult =
  | {
      readonly outcome: 'initialized'
      readonly data: unknown
      /** Locations left absent because their declarations disagreed. */
      readonly conflicts: readonly DefaultConflict[]
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
    const { writes, conflicts } = collect(current, view(current))
    if (writes.length === 0) {
      return { outcome: 'initialized', data: current, conflicts, passes: pass }
    }
    for (const write of writes) {
      current = writeAtPointer(current, write.location, deepCopy(write.value))
    }
  }

  return { outcome: 'budget-exhausted', passes: maxPasses }
}

interface Write {
  readonly location: Location
  readonly value: unknown
}

function collect(
  data: unknown,
  view: InitializationView,
): { writes: Write[]; conflicts: DefaultConflict[] } {
  const candidates: Write[] = []
  const conflicts: DefaultConflict[] = []
  const conflicted = new Set<Location>()

  for (const location of view.reachable) {
    const declarations = view.defaults.get(location)
    if (!declarations || declarations.length === 0) continue
    if (!isAbsent(data, location)) continue
    if (!isWritable(data, location)) continue

    const resolved = resolve(declarations)
    if (resolved === undefined) {
      conflicted.add(location)
      conflicts.push({ location, sourceIds: declarations.map((d) => d.sourceId) })
      continue
    }
    candidates.push({ location, value: resolved.value })
  }

  // A container default is materialised whole and recursed into on a later
  // pass, so a descendant write in this pass would be the precedence rule the
  // whole-value decision exists to avoid.
  const withoutDescendants = candidates.filter(
    (write) => !candidates.some((other) => isStrictDescendant(write.location, other.location)),
  )

  // A conflict produces no write, so the filter above has nothing to shadow a
  // descendant against, and creating the parent would materialise the location
  // the conflict said to leave absent.
  const writes = withoutDescendants.filter(
    (write) => !hasConflictedAbsentAncestor(data, write.location, conflicted),
  )

  return { writes, conflicts }
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
function isAbsent(data: unknown, location: Location): boolean {
  const segments = parsePointer(location)
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
 * Whether a write can reach the location without destroying something or
 * guessing.
 *
 * An absent ancestor is created as an object. An ancestor holding a scalar is
 * refused, because writing through it would spread the scalar into character
 * keys, which is the corruption issue #124 records at the root. An absent
 * ancestor whose child segment is an array index is also refused: creating it
 * would mean choosing between `{}` and `[]`, and ADR-003 leaves array rows to
 * whatever #120 and identity keys settle. Refusing is not the same as skipping
 * silently, which is why a refusal is reported alongside the conflicts.
 */
function isWritable(data: unknown, location: Location): boolean {
  const segments = parsePointer(location)
  let current: unknown = data
  for (let index = 0; index < segments.length; index += 1) {
    // `current` is the container that has to hold `segments[index]`.
    if (current === undefined) return !isArrayIndex(segments[index]!)
    if (!isContainer(current)) return false
    if (index === segments.length - 1) return true
    current = (current as Record<string, unknown>)[segments[index]!]
  }
  return true
}

function isArrayIndex(segment: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(segment)
}

/**
 * Sets a value, creating every missing object level on the way.
 *
 * `setAtPointer` is not used because it creates exactly one missing level and
 * throws a `TypeError` on two, which is a defect in its own right and is
 * tracked as #129. The pass needs the rule ADR-003 gives it, that a parent
 * object is created to hold a child default, at any depth. `isWritable` has
 * already established that nothing on the path is a scalar and that no missing
 * level would have to be an array.
 */
function writeAtPointer(data: unknown, location: Location, value: unknown): unknown {
  const segments = parsePointer(location)
  if (segments.length === 0) return value

  const [head, ...rest] = segments
  const child = isContainer(data) ? (data as Record<string, unknown>)[head!] : undefined
  const written =
    rest.length === 0 ? value : writeAtPointer(child, `/${rest.join('/')}` as Location, value)

  if (Array.isArray(data)) {
    const copy = [...data]
    copy[Number(head)] = written
    return copy
  }
  return { ...(isContainer(data) ? (data as Record<string, unknown>) : {}), [head!]: written }
}

function hasConflictedAbsentAncestor(
  data: unknown,
  location: Location,
  conflicted: ReadonlySet<Location>,
): boolean {
  return properAncestors(location).some(
    (ancestor) => conflicted.has(ancestor) && isAbsent(data, ancestor),
  )
}

function properAncestors(location: Location): Location[] {
  const segments = parsePointer(location)
  return segments
    .slice(0, -1)
    .map((_, index) => `/${segments.slice(0, index + 1).join('/')}` as Location)
}

function isStrictDescendant(candidate: Location, of: Location): boolean {
  return candidate !== of && candidate.startsWith(`${of}/`)
}

function isContainer(value: unknown): boolean {
  return typeof value === 'object' && value !== null
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
