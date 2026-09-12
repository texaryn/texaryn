---
'@texaryn/core': minor
---

Applies a root-level `default` where no `initialData` was supplied, closing
#150.

Omitting `initialData` and passing `{}` are two different inputs and now stay
two. The first states nothing about the root, so a root-level `default` applies
to it; the second is a root the caller supplied, and nothing is written over it.
Without a policy configured, both are `{}` as before.

The `{}` substitution stays, because `undefined` is not JSON and the hyperjump
adapter refuses it at the root. The absence travels beside the data instead, as
the same provisional location an `InsertItem` with no value already uses, so the
port receives `{}` at every moment while the pass reads the root as absent. If
nothing is declared at the root, the `{}` is what the caller gets.

A `Reset` restores a baseline that exists, so its target is never an unstated
root and a root default does not apply a second time over it.
