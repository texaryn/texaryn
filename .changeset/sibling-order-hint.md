---
'@texaryn/core': minor
---

The `order` field hint is now applied. It sets presentation order among siblings: lower comes first, a field without one keeps its schema position, and equal values keep schema order. Hinted and unhinted fields share one scale, so moving a field to the front means giving it a value below every schema index. It orders siblings and nothing else, and array items are unaffected because their order is their data order.

`colSpan` and `hidden` are now marked deprecated. Both were already inert. `colSpan` needs a layout contract that does not exist, and `hidden` needs an explicit decision about whether a hidden field validates, submits, stays active and retains its data, which would otherwise conflict with the active and inactive semantics schema evaluation already provides. Neither is removed yet; both go in the next major.
