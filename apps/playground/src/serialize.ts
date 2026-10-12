const TYPE_MARKER = '$texarynInspectorValue'

function normalise(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === undefined) return { [TYPE_MARKER]: 'undefined' }
  if (typeof value === 'bigint') return { [TYPE_MARKER]: 'bigint', value: String(value) }
  if (value === null || typeof value !== 'object') return value
  if (ancestors.has(value)) return { [TYPE_MARKER]: 'circular-reference' }

  ancestors.add(value)
  if (value instanceof Map) {
    const result = {
      [TYPE_MARKER]: 'Map',
      entries: [...value.entries()].map(([key, entry]) => [
        normalise(key, ancestors),
        normalise(entry, ancestors),
      ]),
    }
    ancestors.delete(value)
    return result
  }
  if (value instanceof Set) {
    const result = { [TYPE_MARKER]: 'Set', values: [...value].map((entry) => normalise(entry, ancestors)) }
    ancestors.delete(value)
    return result
  }
  if (Array.isArray(value)) {
    const result = value.map((entry) => normalise(entry, ancestors))
    ancestors.delete(value)
    return result
  }
  const result = Object.fromEntries(
    Object.keys(value).sort().map((key) => [
      key,
      normalise((value as Record<string, unknown>)[key], ancestors),
    ]),
  )
  ancestors.delete(value)
  return result
}

export function inspect(value: unknown): string {
  try {
    return JSON.stringify(normalise(value, new WeakSet()), null, 2)
  } catch (error) {
    return `Could not serialize: ${error instanceof Error ? error.message : String(error)}`
  }
}
