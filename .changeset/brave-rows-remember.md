---
"@texaryn/core": patch
---

Per-node runtime state now follows the logical array item across a reorder instead of staying at the index. Node ids are positional, so `MoveItem` used to leave `dirty`, `touched`, `errors` and `validationStatus` with whichever item took the old position, which reported a valid row as invalid carrying another row's message while the invalid row looked valid. Recompilation now carries state by a logical address built from property names and `StableItemId`s, rebasing a moved item's error pointers, and starts an inserted item fresh. Every binding reads `getNodeState`, so React, Vue and Web Components all gain the fix unchanged.
