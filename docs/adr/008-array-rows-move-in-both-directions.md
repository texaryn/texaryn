# ADR-008: Array Rows Move in Both Directions

## Status

Accepted. When `canReorder` is true, each row can move one position up or down.
All renderer families use the same labels and boundary rules.

## Context

React exposes `move` and `canReorder` from `useFieldArray`, but its three widget
sets render no reorder control. Vue and Web Components render only `Up`. The
shared `FormMessages` contract already has `moveItemUp`; ADR-004 leaves
`moveItemDown` open for reorder parity.

## Decision

Add `moveItemDown(context: ItemActionContext): ActionMessage` to `FormMessages`.
The English message uses visible text `Down` and an accessible name that includes
the direction, item title or `item`, one-based position, and container title
when present. As with every action, the accessible name contains its visible
label.

When `canReorder` is false, rows have no reorder controls. When it is true, a
row at index `i` in an array of length `n` has an `Up` control if `i > 0`, and a
`Down` control if `i < n - 1`. Each control dispatches one adjacent
`MoveItem`. Rows expose controls in the same order in every renderer: `Up`,
`Down`, then `Remove` when each is available. Names are recalculated from the
current row position and annotations after every move.

The existing stable item identity remains the row key. The control changes the
order of those rows without replacing their mounted fields.

When a focused reorder control is activated, focus stays on the moved row. If
the move reaches a boundary and hides that direction, focus moves to the other
available reorder control in that row after the update. Other moves keep focus
on the activated control. A programmatic move that starts with focus elsewhere
leaves focus there.

## Consequences

Every row in a reorderable array can move in either direction by one position.
The required `moveItemDown` member is a source change for applications that
provide their own `FormMessages`. The affected packages are released together
with a minor version increase while they remain below `1.0.0`.

## Related

- [ADR-004: Built-in Copy Is Localizable Through One Contract](004-built-in-copy-is-localizable.md)
- [ADR-005: The Error Summary Takes Focus After a Failed Submit](005-the-error-summary-takes-focus-after-a-failed-submit.md)
- [ROADMAP.md](../../ROADMAP.md), item 7
