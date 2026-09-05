// JSON.stringify turns a Map into {} and drops undefined, so a projection
// serialized naively looks empty. These make the inspector show what is
// actually there, deterministically, so two renders of the same state read
// the same and a diff means something changed.

function normalise(value: unknown): unknown {
  if (value instanceof Map) {
    // Sorted so the view is stable across renders rather than reflecting
    // whatever order the Map happens to iterate in.
    return Object.fromEntries(
      [...value.entries()]
        .map(([key, entry]) => [String(key), normalise(entry)] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    )
  }
  if (value instanceof Set) {
    return [...value].map(normalise)
  }
  if (Array.isArray(value)) {
    return value.map(normalise)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key]
      // Keep undefined visible: "this key exists and is unset" is different
      // from "this key is absent", and both occur in a projection.
      out[key] = entry === undefined ? null : normalise(entry)
    }
    return out
  }
  return value
}

export function inspect(value: unknown): string {
  try {
    return JSON.stringify(normalise(value), null, 2)
  } catch (error) {
    return `Could not serialize: ${error instanceof Error ? error.message : String(error)}`
  }
}
