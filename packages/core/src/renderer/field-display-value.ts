/** Formats field values for text controls, using JSON for objects and a stable serialization fallback. */
export function formatFieldDisplayValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${value}`
  }
  if (typeof value === 'symbol' || typeof value === 'function') return value.toString()
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return '[unserializable value]'
  }
}
