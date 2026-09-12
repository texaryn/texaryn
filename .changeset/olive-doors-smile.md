---
---

Corrects the published JSDoc on `FormRuntimeOptions.initialization` and
`FormRuntime.initialization`, which said the pass runs "at construction and on
`Reset`" and named only a `Reset` as able to exhaust the budget.

No bump, because the option has not published: #151's minor is still pending and
the release in flight predates it, so no released `.d.ts` ever carried the wrong
text.

The semantics the docstrings now state are the ones #151 implemented and
ADR-003 decided. This is the exact point that made the first implementation of
#151 wrong, so leaving the type's own documentation asserting the rejected
reading would reintroduce it at the surface a consumer reads first.
