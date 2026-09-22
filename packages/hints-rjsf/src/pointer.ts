import type { JsonPointer } from '@texaryn/core'

export function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function append(base: string, segment: string): string {
  return `${base}/${escapeSegment(segment)}`
}

export function appendPointer(base: JsonPointer, segment: string): JsonPointer {
  return append(base, segment) as JsonPointer
}

export function segmentsOf(pointer: string): string[] | undefined {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) return undefined
  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
}

export function isCanonicalIndex(segment: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(segment)
}

export function isWithin(pointer: string, ancestor: string): boolean {
  return pointer === ancestor || pointer.startsWith(`${ancestor}/`)
}
