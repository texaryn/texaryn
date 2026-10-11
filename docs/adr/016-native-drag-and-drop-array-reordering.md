# ADR-016: Native Drag Complements Array Move Controls

## Status

Accepted, 2026-10-11

## Context

Array identity and the `MoveItem` command are already implemented in core.
Renderer controls expose one-position Up and Down actions for arrays whose
`canReorder` hint is true. The roadmap adds direct manipulation without
replacing the command or changing the array identity contract.

The renderer packages use different UI frameworks, but they run in a browser
and already render a stable row for each `StableItemId`. Native HTML drag and
drop can provide a small pointer interaction with no runtime or package
dependency. It does not provide a dependable touch or keyboard interaction,
so existing controls remain the accessible and touch path.

## Decision

Add a native HTML drag handle and row drop target to reorderable arrays in the
React, React Bootstrap, React MUI, Vue, Solid, Svelte, Angular, and Web
Components renderers. Keep the existing Up and Down controls in every renderer.

The pointer-only handle is available only when the current array allows
reordering and is neither effectively read-only nor disabled. It is a
decorative, non-focusable drag source, hidden from the accessibility tree. It
does not add a tab stop or claim keyboard activation. The existing named Up and
Down controls remain the keyboard and touch alternative.

An active drag session records the exact `FormRuntime` object, the array's
stable `ArrayMeta.identityKey`, and the source `StableItemId`. Before accepting
a drag or drop event, a renderer rechecks the current runtime, array identity,
`canReorder`, `readOnly`, `disabled`, and that both stable item IDs still
resolve in the same array. No event uses an index captured at render time. A
session is cleared on drag end, cancellation, successful or rejected drop,
source disappearance, array or runtime replacement, identity change, and
component teardown.

Each array root marks its owning DOM region. A row handler acts only when the
event target's nearest array root is its own. A nested array consumes events
owned by its rows, so ancestors cannot reinterpret a nested drag or drop.
Moving between different array roots is never accepted.

The handle transfers only the opaque stable item ID through `DataTransfer`; it
never transfers row values or application data. Drop targets resolve the
source and target's current indexes from stable IDs at event time. A drop on
the upper or lower half of a row chooses the corresponding insertion boundary,
then adjusts that boundary for the source row's removal before dispatching
`MoveItem`.

The handler prevents the browser's default drag behavior only for a valid
session and target in the same array. A completed drop dispatches at most one
`MoveItem`; dropping an item at its current position is a no-op. Read-only,
disabled, or non-reorderable arrays cancel the session without dispatching.

The UI marks the active row and current drop target with data attributes for
styling. It does not add a new core command, public runtime API, localization
entry, or package dependency. Existing Up and Down controls retain their
localized accessible names and remain visible, keyboard operable, and available
for touch users and browsers without native drag support.

## Consequences

Users can reorder arrays by dragging a row handle on browsers with native HTML
drag support. `MoveItem` remains the single mutation path, so stable row and
nested-array identities follow existing core semantics. Keyboard and touch
users keep the current one-position controls. Implementations and tests must
cover all renderer packages and both base React themes, opt-in and read-only
behavior, stable identity, nested arrays, and drops at both row boundaries.

This decision does not add cross-array transfers, keyboard drag gestures,
touch-specific drag gestures, or multi-select moves.
