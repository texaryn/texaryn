import type { JsonPointer } from './types.js'

export function parsePointer(pointer: JsonPointer): string[] {
  if (pointer === '' || pointer === '/') return pointer === '' ? [] : ['']
  if (!pointer.startsWith('/')) throw new Error(`Invalid JSON Pointer: ${pointer}`)
  return pointer
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
}

export function getAtPointer(data: unknown, pointer: JsonPointer): unknown {
  const segments = parsePointer(pointer)
  let current: unknown = data
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[seg]
  }
  return current
}

export function setAtPointer(
  data: unknown,
  pointer: JsonPointer,
  value: unknown,
): unknown {
  const segments = parsePointer(pointer)
  if (segments.length === 0) return value
  return setRecursive(data, segments, 0, value, pointer)
}

/**
 * Whether a value on the path can have a property written into it.
 *
 * Absent passes, because creating a missing level is how a nested field gets
 * written at all, and `null` passes with it: `getAtPointer` reads through
 * `null` and `undefined` identically, so refusing here would make reading and
 * writing disagree about what `null` is. A schema of
 * `{ type: ['object', 'null'] }` whose instance starts at `null` is the case
 * where that matters rather than being symmetry for its own sake.
 *
 * Everything else that is not an object refuses. It used to be spread, which is
 * where `{ ...'plain' }` produced `{0:'p',1:'l',2:'a',3:'i',4:'n'}` and
 * `{ ...7 }` produced `{}`: an instance no schema described, from data the
 * caller supplied.
 */
function canHoldProperty(current: unknown): boolean {
  // `typeof null === 'object'`, so the `null` case above needs no term of its
  // own here. Adding one reads as the decision but is unreachable.
  return current === undefined || typeof current === 'object'
}

/**
 * Whether a segment is in the canonical form of an array index.
 *
 * Canonical rather than merely digit-bearing: `0` and `12` are indices, while
 * `01`, `1.0`, `-1` and `1x` are ordinary object keys, so creating an object
 * for those is not a guess. Shared with the ADR-003 initialization prototype,
 * which needs the same distinction for the same reason.
 */
export function isArrayIndexSegment(segment: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(segment)
}

/** Where a value sits, for an error message: the root, or its pointer. */
function locationOf(segments: string[], depth: number): string {
  return depth === 0 ? 'the root value' : `the value at "/${segments.slice(0, depth).join('/')}"`
}

function setRecursive(
  current: unknown,
  segments: string[],
  depth: number,
  value: unknown,
  pointer: JsonPointer,
): unknown {
  const key = segments[depth]!
  if (!canHoldProperty(current)) {
    throw new Error(
      `Cannot write to "${pointer}": ${locationOf(segments, depth)} is a ${typeof current}, ` +
        `which cannot hold a property`,
    )
  }
  // A level that is not there has to be created, and its kind is decidable
  // from the key it must hold in every case but one. An index needs an array,
  // and a JSON Pointer cannot say whether `/rows/0` means an array or an
  // object keyed "0", so this refuses rather than guessing: either guess
  // silently produces a shape the schema may not describe.
  //
  // Unreachable through the runtime. Every array command writes the whole
  // array at the container's own pointer, and item nodes are minted only from
  // rows already present in the data, so the level above an index is never the
  // missing one. It is reachable by a host calling this helper directly.
  if (current === undefined || current === null) {
    if (isArrayIndexSegment(key)) {
      throw new Error(
        `Cannot write to "${pointer}": ${locationOf(segments, depth)} is absent, and the ` +
          `pointer cannot tell whether "${key}" is an array index or an object key, so there ` +
          `is no container to create. Create it explicitly first.`,
      )
    }
  }
  if (depth === segments.length - 1) {
    if (Array.isArray(current)) {
      const copy = [...current]
      copy[Number(key)] = value
      return copy
    }
    return { ...(current as Record<string, unknown>), [key]: value }
  }
  // Read through a missing level rather than into it. Indexing `undefined`
  // here is what raised a `TypeError` on the second absent level, while the
  // last-segment branch above tolerated absence because `{ ...undefined }` is
  // `{}`, which is why one level used to work and two did not.
  const child =
    current === undefined || current === null
      ? undefined
      : (current as Record<string, unknown>)[key]
  const updated = setRecursive(child, segments, depth + 1, value, pointer)
  if (Array.isArray(current)) {
    const copy = [...current]
    copy[Number(key)] = updated
    return copy
  }
  return { ...(current as Record<string, unknown>), [key]: updated }
}
