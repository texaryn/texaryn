---
'@texaryn/core': minor
---

`visibleErrorLabel(error)` and `visibleErrorMessages(error)` hold the fallback
rules an error summary applies to a `VisibleError`: the field title, else the
pointer, else the node id; each message, else its keyword. Every binding's
summary reads them, so the three cannot drift.
