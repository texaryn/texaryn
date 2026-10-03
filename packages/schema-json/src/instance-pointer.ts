import { escape as escapeSegment } from './schema-graph.js'

export interface ReportedError {
  code: string
  value: unknown
  missingKey?: string
  lastKey?: string
}

export type PointerResolver = (jslPointer: string, reported: ReportedError) => string

interface Entry {
  id: number
  pointer: string
  key: string
  value: unknown
  parent: unknown
}

const MAX_NODES = 2_000_000
const MAX_CHARS = 4_000_000
const MAX_STRINGIFIED = 64

function childrenOf(node: object): [string, unknown][] {
  if (Array.isArray(node)) return Array.from(node, (item, index): [string, unknown] => [String(index), item])
  return Object.keys(node).map((key) => [key, (node as Record<string, unknown>)[key]])
}

function hasSlashKey(data: unknown): boolean {
  const stack: unknown[] = [data]
  for (let visited = 0; stack.length > 0 && visited < MAX_NODES; visited += 1) {
    const node = stack.pop()
    if (typeof node !== 'object' || node === null) continue
    for (const [key, child] of childrenOf(node)) {
      if (key.includes('/')) return true
      stack.push(child)
    }
  }
  return false
}

function indexOf(data: unknown): Map<string, Entry[]> | undefined {
  if (!hasSlashKey(data)) return undefined
  const index = new Map<string, Entry[]>()
  const stack: { node: unknown; joined: string; pointer: string }[] = [{ node: data, joined: '', pointer: '' }]
  let chars = 0
  let id = 0
  while (stack.length > 0) {
    const { node, joined, pointer } = stack.pop()!
    if (typeof node !== 'object' || node === null) continue
    const frames: { node: unknown; joined: string; pointer: string }[] = []
    for (const [key, value] of childrenOf(node)) {
      const entry = { id: id++, pointer: `${pointer}/${escapeSegment(key)}`, key, value, parent: node }
      const path = `${joined}/${key}`
      chars += path.length + entry.pointer.length
      if (chars > MAX_CHARS) return undefined
      const known = index.get(path)
      if (known) known.push(entry)
      else index.set(path, [entry])
      frames.push({ node: value, joined: path, pointer: entry.pointer })
    }
    for (let i = frames.length - 1; i >= 0; i -= 1) stack.push(frames[i]!)
  }
  return index
}

function narrow(candidates: Entry[], reported: ReportedError): Entry[] {
  let current = candidates
  const keep = (test: (entry: Entry) => boolean): void => {
    const next = current.filter(test)
    if (next.length > 0) current = next
  }
  if (reported.lastKey !== undefined) keep((entry) => entry.key === reported.lastKey)
  if (current.length > 1) keep((entry) => Object.is(entry.value, reported.value))
  if (current.length > 1) keep((entry) => Object.is(entry.parent, reported.value))
  if (current.length > 1 && current.length <= MAX_STRINGIFIED && typeof reported.value === 'string') {
    const text = reported.value
    keep((entry) => {
      try {
        return JSON.stringify(entry.value) === text
      } catch {
        return false
      }
    })
  }
  return current
}

export function pointerResolver(data: unknown): PointerResolver {
  let index: Map<string, Entry[]> | undefined
  let indexed = false
  const taken = new Map<string, number>()

  const locate = (raw: string, reported: ReportedError): string => {
    const escaped = raw.includes('~') ? `/${raw.slice(1).split('/').map(escapeSegment).join('/')}` : raw
    if (!indexed) {
      index = indexOf(data)
      indexed = true
    }
    const candidates = index?.get(raw)
    if (!candidates) return escaped
    const current = candidates.length > 1 ? narrow(candidates, reported) : candidates
    if (current.length === 1) return current[0]!.pointer
    const group = `${reported.code}\0${raw}\0${current.map((entry) => entry.id).join(',')}`
    const used = taken.get(group) ?? 0
    taken.set(group, used + 1)
    return current[used % current.length]!.pointer
  }

  return (jslPointer, reported) => {
    const raw = jslPointer.replace(/^#/, '')
    const base = raw === '' || !raw.startsWith('/') ? raw : locate(raw, reported)
    return reported.missingKey === undefined ? base : `${base}/${escapeSegment(reported.missingKey)}`
  }
}
