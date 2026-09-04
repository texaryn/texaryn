---
'@texaryn/core': patch
---

Array item identity now survives mutation at the document boundary. The command handler already maintained it, reconciling on data changes and updating it directly for insert, remove and move, but every recompile discarded that and rebuilt a positional set, so `arrayMeta.itemIds` handed renderers index semantics: removing the first of two rows moved the survivor from `item_1` to `item_0`, detaching any per-row state keyed to it. Compilation now adopts the identity the handler produced.

`compile()` takes an optional fourth argument carrying that identity forward. It is additive and defaults to the previous behaviour, so no caller has to change.
