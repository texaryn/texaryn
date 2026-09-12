/**
 * The JSON instance an object stands for, with `undefined` read as absence.
 *
 * `@hyperjump/json-schema`'s `Instance.fromJs` refuses `undefined` outright, and
 * the runtime produces it by design: a cleared number input becomes `undefined`
 * in the binding, and `SetValue` keeps the key rather than removing it, because
 * ADR-003 depends on a filled location never becoming absent again. So the port
 * is handed `undefined` on a keystroke and has to say what it means instead of
 * throwing out of `dispatch`.
 *
 * Absence is the answer, and it is not a choice this adapter is making alone:
 * `JSON.stringify({ a: undefined })` is `{}`, so the property does not reach the
 * server either, and json-schema-library already reads it that way. A validator
 * that disagreed with the payload about which properties exist would accept what
 * the submission rejects.
 *
 * An array element is the one place absence cannot be expressed, since dropping
 * it would renumber every element after it and change which schema applies under
 * `prefixItems`. `JSON.stringify([undefined])` is `[null]`, so `null` is both
 * what the server will see and the only answer that keeps the indices. That the
 * two containers answer differently is a property of JSON rather than of this
 * adapter.
 *
 * Nothing produces such an element today, so the array clause is written for
 * the contract rather than for a caller: `InsertItem` writes `null` and
 * `setAtPointer` writes what it is given. What an omitted row should hold is
 * issue #127.
 *
 * The copy is shallow where it can be: a subtree holding no `undefined` is
 * returned as it stands, so the common case allocates nothing and validation of
 * an unchanged document costs what it did before.
 */
export function toJsonInstance(value: unknown): unknown {
  if (Array.isArray(value)) {
    let changed = false
    const mapped = value.map((element) => {
      if (element === undefined) {
        changed = true
        return null
      }
      const next = toJsonInstance(element)
      if (next !== element) changed = true
      return next
    })
    return changed ? mapped : value
  }

  if (value === null || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  let changed = false
  const mapped: Record<string, unknown> = {}
  for (const key of Object.keys(record)) {
    const element = record[key]
    if (element === undefined) {
      changed = true
      continue
    }
    const next = toJsonInstance(element)
    if (next !== element) changed = true
    mapped[key] = next
  }
  return changed ? mapped : value
}
