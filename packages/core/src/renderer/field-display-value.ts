/** Formats field values for text controls, preserving matching string and number input values. */
export function formatFieldDisplayValue(value: unknown): string
export function formatFieldDisplayValue(value: unknown, kind: string): string | number
export function formatFieldDisplayValue(value: unknown, kind?: string): string | number {
  if (kind === 'number' && typeof value === 'number') return value
  if (kind === 'string' && typeof value === 'string') return value
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
