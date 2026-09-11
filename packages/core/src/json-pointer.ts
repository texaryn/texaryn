import type { JsonPointer } from './types.js'

export function parsePointer(pointer: JsonPointer): string[] {
  if (pointer === '' || pointer === '/') return pointer === '' ? [] : ['']
  if (!pointer.startsWith('/')) throw new Error(`Invalid JSON Pointer: ${pointer}`)
  return pointer
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
}

/**
 * The member a JSON object actually has at `key`, or `undefined`.
 *
 * Own properties only. `current[key]` finds inherited ones, so `{}` appears to
 * have `constructor`, `toString` and a `__proto__` leading out of the
 * document, none of which are members of the instance. `"constructor"` is a
 * legal JSON Schema property name, and before this a schema declaring it could
 * not be filled in: the inherited function is not something a property can be
 * written into, so the guard below refused it.
 */
function ownMember(current: unknown, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(current as object, key)
    ? (current as Record<string, unknown>)[key]
    : undefined
}

/**
 * The value at `pointer`, or `undefined`.
 *
 * Total: any pointer that does not address an own member of a container on the
 * path yields `undefined` rather than throwing. That includes a token that
 * could not index an array, such as `/01` or `/-`, which address nothing.
 * `setAtPointer` throws for those instead, because writing to a location that
 * cannot exist is a mistake while reading one is just a miss.
 */
export function getAtPointer(data: unknown, pointer: JsonPointer): unknown {
  const segments = parsePointer(pointer)
  let current: unknown = data
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined
    current = ownMember(current, seg)
  }
  return current
}

/**
 * Returns `data` with `value` written at `pointer`, without mutating it.
 *
 * The contract, because this is exported and its behaviour was previously
 * stated nowhere:
 *
 * 1. Only own members are read on the way. Inherited JavaScript properties are
 *    not members of a JSON document.
 * 2. The empty pointer replaces the whole document.
 * 3. A level that is absent is created as an object, whatever its key looks
 *    like. A numeric key does not imply an array.
 * 4. `null` is created through, like absence: neither holds a payload to
 *    preserve, so an explicit write may turn either into a container.
 * 5. A scalar on the path throws. Turning it into a container would destroy a
 *    value the caller supplied.
 * 6. On an array, a canonical index (`0`, or digits with no leading zero)
 *    writes that element, and `-` appends, both per RFC 6901.
 * 7. Any other token on an array throws. `01` and `1x` are not indices, and
 *    coercing them wrote to an element the reader could never address.
 * 8. An index past `length` throws. Extending an array leaves holes, which
 *    serialize as `null`, so the caller would submit values no schema
 *    described.
 *
 * The reader is total where this throws, and that asymmetry is deliberate:
 * reading a location that does not exist yields `undefined`, while writing
 * where nothing can be written is an error. Both agree on what the location
 * is; they differ on what to do about it.
 */
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
 * The inverse of what `parsePointer` undoes, so a rebuilt pointer addresses the
 * location it names. `~` first, or escaping `/` to `~1` would then have its own
 * `~` escaped again.
 */
function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

/**
 * Where a value sits, for an error message: the root, or its pointer.
 *
 * Segments are re-escaped rather than joined raw. `parsePointer` unescapes, so
 * joining its output would print `/a/b` for the single key `a/b`, and a caller
 * who copied that pointer out of the message would address somewhere else.
 */
function locationOf(segments: string[], depth: number): string {
  const path = segments
    .slice(0, depth)
    .map((segment) => `/${escapeSegment(segment)}`)
    .join('')
  return depth === 0 ? 'the root value' : `the value at "${path}"`
}

/**
 * The element a token addresses in `array`, or a refusal.
 *
 * RFC 6901: an array token is digits with no leading zero, or `-` for the
 * position after the last element. Everything else is an error condition, and
 * `getAtPointer` already treats it as addressing nothing, so coercing it here
 * with `Number()` wrote to an element the reader could never address, or, for
 * a token that coerces to `NaN`, to a property that serialization silently
 * drops.
 *
 * Past the end is refused for the same reason rather than extending: the gap
 * would be holes, and a hole serializes as `null`, so the caller would submit
 * values no schema described. `-` and an index equal to `length` both append,
 * which is the one position past the last that creates no gap.
 */
function arrayIndexFor(
  array: readonly unknown[],
  key: string,
  segments: string[],
  depth: number,
  pointer: JsonPointer,
): number {
  if (key === '-') return array.length
  if (!/^(0|[1-9][0-9]*)$/.test(key)) {
    throw new Error(
      `Cannot write to "${pointer}": ${locationOf(segments, depth)} is an array and "${key}" ` +
        `is not an array index, so it addresses no element`,
    )
  }
  const index = Number(key)
  if (index > array.length) {
    throw new Error(
      `Cannot write to "${pointer}": ${locationOf(segments, depth)} is an array of length ` +
        `${array.length}, and "${key}" is past the end, so writing it would leave holes`,
    )
  }
  return index
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
  // A missing level is created as an object, whatever its key looks like. A
  // numeric segment does not imply an array: an object property may be named
  // "0", and the runtime generates such a pointer from the schema's own
  // property names. Refusing it would break a legitimate schema to guard a
  // case that cannot arise, because an array item's pointer only exists once
  // its row is in the data, which means its array already exists. An array
  // that has to be created is created by the caller.
  if (depth === segments.length - 1) {
    if (Array.isArray(current)) {
      const copy = [...current]
      copy[arrayIndexFor(current, key, segments, depth, pointer)] = value
      return copy
    }
    return { ...(current as Record<string, unknown>), [key]: value }
  }
  // Read through a missing level rather than into it. Indexing `undefined`
  // here is what raised a `TypeError` on the second absent level, while the
  // last-segment branch above tolerated absence because `{ ...undefined }` is
  // `{}`, which is why one level used to work and two did not.
  // Validated before descending, so a refusal names the array rather than
  // surfacing from somewhere deeper as a confusing message about its element.
  const index = Array.isArray(current)
    ? arrayIndexFor(current, key, segments, depth, pointer)
    : undefined
  const child =
    current === undefined || current === null ? undefined : ownMember(current, key)
  const updated = setRecursive(child, segments, depth + 1, value, pointer)
  if (Array.isArray(current)) {
    const copy = [...current]
    copy[index!] = updated
    return copy
  }
  return { ...(current as Record<string, unknown>), [key]: updated }
}
