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

function setRecursive(
  current: unknown,
  segments: string[],
  depth: number,
  value: unknown,
  pointer: JsonPointer,
): unknown {
  const key = segments[depth]
  if (!canHoldProperty(current)) {
    const location =
      depth === 0 ? 'the root value' : `the value at "/${segments.slice(0, depth).join('/')}"`
    throw new Error(
      `Cannot write to "${pointer}": ${location} is a ${typeof current}, ` +
        `which cannot hold a property`,
    )
  }
  if (depth === segments.length - 1) {
    if (Array.isArray(current)) {
      const copy = [...current]
      copy[Number(key)] = value
      return copy
    }
    return { ...(current as Record<string, unknown>), [key]: value }
  }
  const child = (current as Record<string, unknown>)[key]
  const updated = setRecursive(child, segments, depth + 1, value, pointer)
  if (Array.isArray(current)) {
    const copy = [...current]
    copy[Number(key)] = updated
    return copy
  }
  return { ...(current as Record<string, unknown>), [key]: updated }
}
