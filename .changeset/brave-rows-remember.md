---
"@texaryn/core": patch
---

Per-node runtime state now follows the logical array item across a reorder instead of staying at the index. Node ids are positional, so `MoveItem` used to leave `dirty`, `touched`, `errors` and `validationStatus` with whichever item took the old position, which reported a valid row as invalid carrying another row's message while the invalid row looked valid. Recompilation now carries interaction history by a logical address built from property names and `StableItemId`s, and starts an inserted item fresh. A validation result is dropped rather than moved when an item's pointer changes, because a schema can apply per index, so a result produced at the old position says nothing about the new one. Every binding reads `getNodeState`, so React, Vue and Web Components all gain the fix unchanged.
