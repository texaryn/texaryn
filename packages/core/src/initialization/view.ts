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
 * Not exported from the package, for the same reason the pass is not: the two
 * together decide what the runtime's baseline is.
 */
export function viewFromProjection(projection: SchemaProjection): InitializationView {
  const reachable = new Set<Location>()
  const defaults = new Map<Location, unknown>()
  const conflicts = new Map<Location, readonly string[]>()

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
    // The node rather than `projection.diagnostics`, which carries only the
    // disagreements that hold whatever the instance is. The pass acts on what
    // applies to the data in front of it, and a `oneOf` branch competing with
    // the base applies exactly while its branch is selected. Every conflict the
    // diagnostic reports is also on its node, so reading one channel loses
    // nothing.
    if (node.defaultConflict) conflicts.set(pointer, node.defaultConflict)
  }

  return { reachable, defaults, conflicts }
}
