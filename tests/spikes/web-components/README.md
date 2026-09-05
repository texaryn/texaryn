# Web Components spike

Throwaway. Nothing here is kept; the output is the findings below and the
recommendation in the pull request that reports them.

The question: can a direct-DOM binding over the unchanged `FormRuntime`
reconcile document changes without losing focus, borrow a runtime it does not
own, and submit through a real form, without growing a virtual DOM?

Run the structural proofs with:

```bash
pnpm vitest run --config tests/spikes/web-components/vitest.config.ts
```

Run the browser probe with the `wc-probe` launch configuration, or:

```bash
pnpm exec vite --config tests/spikes/web-components/probe/vite.config.ts
```

`?legacy=1` removes `Element.prototype.moveBefore` so the `insertBefore`
fallback is what gets exercised.

## Findings

Answer: yes to all three, and no virtual DOM was needed. The binding is a
tree of widgets that each own one DOM subtree and accept a new node on update.
Reconciliation is two loops, one per container kind.

**Reconciliation.** Eleven jsdom proofs pass and the browser probe confirms
the two claims jsdom cannot make. Typing `b` into a field whose `if/then`
reveals a sibling keeps the focused input and its caret. Moving an array row
keeps the row element, keeps the focused input inside it with its selection,
rebinds the input to the new positional node (its `name` goes from
`/items/1/name` to `/items/0/name`), and typing afterwards writes to index 0.
Both hold with the atomic `moveBefore` present and with it removed.

Two things had to be true for that, and neither is obvious from the runtime
contract:

1. Object children are keyed by property name, the last pointer segment, not
   by node id. Node ids are positional, so after a row moves every descendant
   arrives with a new id. Keying by id would destroy and recreate the input,
   which is exactly the Vue trap in a different costume.
2. A DOM move is a remove plus an insert, and the removal runs the focus
   fixup, so `insertBefore` on the focused row blurs it. The first version of
   the array reorder failed on precisely this. The fix is to never move the
   element that contains `document.activeElement` and to place every sibling
   relative to it, which yields the same order. `moveBefore` (Chromium 133,
   Firefox 144) is the atomic move that avoids the problem outright and is
   used when present; the anchor rule is what makes the fallback correct.

**Ownership.** `runtime` as the primitive input and `port` plus `options` as
the managed mode coexist behind one mutual-exclusion check. An external
runtime is never destroyed by the element and is rendered again when the
element is reattached. A managed runtime is destroyed on removal only.
`disconnectedCallback` also fires on a reparent, so disposal is deferred to a
microtask and skipped when the element is connected again by then. Moving a
managed element between parents keeps its runtime instance, its input
element and its typed value.

**Native submission.** The element renders `<form novalidate>` in light DOM
and turns the form's `submit` event into `{ type: 'Submit' }`. Clicking a
`type="submit"` button a consumer placed inside the form fails validation on
an untouched required field and, through `attempts`, marks the input
`aria-invalid`, shows the error block and links it through
`aria-describedby`. `texaryn-submission-change` and `texaryn-data-change`
carry the store snapshots as `CustomEvent` details. No `formAssociated`, no
`ElementInternals`.

**Instance ids.** Every id is `<instance>-<nodeId>-<suffix>`. Two elements on
one page share no ids and every label and description resolves inside its own
element. React and Vue both build `texaryn-<nodeId>-<suffix>` with no
instance part, so two forms on one page collide there today. That is a
shared fix, not a Web Components one.

## What the spike did not cover

- Nested arrays. The identity map is keyed by container node id, which is
  positional, so an inner array inside a moved row may not keep its item
  identities. That is a core question and the package will need a test for it.
- `options` is read once, when the managed runtime is created; changing it
  afterwards does nothing. The package needs a rule or a rebuild.
- Textarea, group and layout containers, text and action nodes. The
  registry has a placeholder for anything it cannot resolve.
- Focus management after a failed submit, and hint-driven widget selection.

## Recommendation

Build `@texaryn/web-components` on this shape: DOM widget factories over the
generic renderer registry, a per-container reconcile keyed by property name
and by `StableItemId`, the anchor rule with `moveBefore` when available, and
the two ownership modes as designed. The first real tests to write are the
ones here, moved out of the spike and made permanent: the row move with
focus, the reparent, and the two-instance id proof.
