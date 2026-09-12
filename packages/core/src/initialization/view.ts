import type { SchemaProjection } from '../schema/port.js'
import type { InitializationView, Location } from './kernel.js'

/**
 * What one `SchemaProjection` says, as the three things ADR-003's pass reads.
 *
 * The pass was written against a normalised view rather than a projection so
 * that it could be executed and tested before the port could express the
 * conflict case. It can now, so this is the translation, and it is deliberately
 * nothing more: every rule here is a restatement of something the port already
 * decided.
 *
 * Not exported from the package. ADR-003 is Proposed, and publishing
 * `FormRuntimeOptions.initialization` would ship a contract nobody has accepted.
 */
export function viewFromProjection(projection: SchemaProjection): InitializationView {
  const reachable = new Set<Location>()
  const defaults = new Map<Location, unknown>()

  for (const [pointer, node] of projection.nodes) {
    // Rule 5's "reachable", which is exposure rather than activity. A branch the
    // data identifies but has not yet satisfied is exposed so the user can
    // complete it, and filling only the active locations would leave the field
    // it exposes empty: the ADR's own defect, one branch deeper.
    if (!node.active && node.provisional !== true) continue
    reachable.add(pointer)
    // Presence, not truthiness. A schema declaring `default: false` declares a
    // default, and `0`, `''` and `null` are values like any other.
    if ('default' in node.annotations) defaults.set(pointer, node.annotations.default)
  }

  const conflicts = new Map<Location, readonly string[]>()
  for (const diagnostic of projection.diagnostics ?? []) {
    if (diagnostic.code !== 'ambiguous-default') continue
    // `sources` is optional on the type because the other codes describe one
    // schema position. This code always carries them, and an adapter that did
    // not would still have reported the conflict, which is the part the pass
    // acts on.
    conflicts.set(diagnostic.pointer, diagnostic.sources ?? [])
  }

  return { reachable, defaults, conflicts }
}
