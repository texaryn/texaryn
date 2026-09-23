import { append } from './pointer.js'

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject

export interface JsonObject {
  readonly [key: string]: JsonValue
}

export interface OutsideJson {
  readonly path: string
  readonly key: string
  readonly reason: string
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isJsonArray(value: unknown): value is readonly JsonValue[] {
  return Array.isArray(value)
}

export function member(object: JsonObject, key: string): JsonValue | undefined {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined
}

export function define(object: JsonObject, key: string, value: JsonValue): void {
  Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true })
}

export function deepEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true
  if (isJsonArray(a) || isJsonArray(b)) {
    return (
      isJsonArray(a) &&
      isJsonArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEqual(item, b[index] as JsonValue))
    )
  }
  if (!isJsonObject(a) || !isJsonObject(b)) return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => {
      const other = member(b, key)
      return other !== undefined && deepEqual(a[key] as JsonValue, other)
    })
  )
}

// The conversion reads this copy only, so a getter, proxy or cycle in the
// caller's object throws here, once, and is reported instead.
export function toJson(input: unknown, outside: OutsideJson[]): JsonValue | undefined {
  const ancestors = new Set<object>()
  const reject = (path: string, key: string, reason: string): undefined => {
    outside.push({ path, key, reason })
    return undefined
  }
  const read = (source: object, key: string | number, path: string): { value: unknown } | undefined => {
    try {
      return { value: (source as Record<string | number, unknown>)[key] }
    } catch {
      return reject(path, String(key), 'reading it threw')
    }
  }
  const visit = (value: unknown, path: string, key: string, depth: number): JsonValue | undefined => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : reject(path, key, `${value} is not a JSON number`)
    }
    if (value === undefined) return reject(path, key, 'undefined is not a JSON value')
    if (typeof value !== 'object') return reject(path, key, `a ${typeof value} is not a JSON value`)
    if (depth > 256) return reject(path, key, 'nested deeper than 256 levels')
    if (ancestors.has(value)) return reject(path, key, 'the value contains itself')
    ancestors.add(value)
    try {
      if (Array.isArray(value)) {
        const items: JsonValue[] = []
        for (let index = 0; index < value.length; index++) {
          const at = `${path}/${index}`
          const item = read(value, index, at)
          items.push((item && visit(item.value, at, String(index), depth + 1)) ?? null)
        }
        return items
      }
      const prototype: unknown = Object.getPrototypeOf(value)
      if (prototype !== Object.prototype && prototype !== null) {
        return reject(path, key, 'only a plain object is a JSON object')
      }
      const copy: JsonObject = {}
      for (const name of Object.keys(value)) {
        const at = append(path, name)
        const item = read(value, name, at)
        const json = item && visit(item.value, at, name, depth + 1)
        if (json !== undefined) define(copy, name, json)
      }
      return copy
    } catch {
      return reject(path, key, 'reading it threw')
    } finally {
      ancestors.delete(value)
    }
  }
  return visit(input, '', '', 1)
}
