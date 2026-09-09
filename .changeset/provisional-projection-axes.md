---
'@texaryn/core': minor
---

Separates two facts a projection had been collapsing into one boolean.
`NodeProjection.active` keeps its meaning, that JSON Schema evaluation says the
node applies, and `NodeProjection.provisional` is new: the form exposes the node
so the user can complete it. `ChildProjection.provisionalRequired` is the same
split for requiredness.

A renderer shows a node when either holds, and reports a field required when
either holds, which the compiler decides so the two facts stay apart on the
port. Both new fields are optional and absent means false, so an adapter that
does not select provisionally behaves exactly as before and no binding changes.

Nothing emits `provisional` yet. It exists so a `oneOf` branch the data uniquely
identifies but has not yet satisfied can be shown rather than hidden, which is
issue #120: hiding it leaves the user no way to supply the property that would
make the branch apply.
