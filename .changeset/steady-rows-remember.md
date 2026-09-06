---
"@texaryn/core": minor
---

Array identity is keyed by an opaque `IdentityKey` for the logical container instead of the positional node id, exposed as `ArrayMeta.identityKey`. A nested array now keeps its `StableItemId`s when the row that contains it moves, or when a row is inserted or removed above it. `compile` returns identity for the arrays it visited only, so an array that leaves the document is minted afresh when it returns, and a compile that throws leaves the previous identity untouched. `registerArray`, `insertItem`, `removeItem`, `moveItem` and `reconcile` take an `IdentityKey` where they took a `NodeId`.
