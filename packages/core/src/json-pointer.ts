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
  return setRecursive(data, segments, 0, value)
}

function setRecursive(
  current: unknown,
  segments: string[],
  depth: number,
  value: unknown,
): unknown {
  const key = segments[depth]
  if (depth === segments.length - 1) {
    if (Array.isArray(current)) {
      const copy = [...current]
      copy[Number(key)] = value
      return copy
    }
    return { ...(current as Record<string, unknown>), [key]: value }
  }
  const child = (current as Record<string, unknown>)[key]
  const updated = setRecursive(child, segments, depth + 1, value)
  if (Array.isArray(current)) {
    const copy = [...current]
    copy[Number(key)] = updated
    return copy
  }
  return { ...(current as Record<string, unknown>), [key]: updated }
}
