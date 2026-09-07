---
'@texaryn/react': minor
'@texaryn/react-bootstrap': minor
'@texaryn/react-mui': minor
'@texaryn/vue': minor
'@texaryn/web-components': minor
---

Give every array action control an accessible name that says which row it acts on.

Five buttons all announced as "Remove" leave a screen reader user guessing. Each now carries the current 1-based position and whatever schema titles exist, so "Remove Contact 2 from Contacts", degrading to "Remove item 2" when nothing is titled. Reorder controls read "Move up Contact 2 in Contacts", and the per-array control reads "Add item to Contacts". The visible words stay "Remove", "Up" and "Add", with the longer string in `aria-label`, which contains the visible text so speech input still works.

The row's own value is deliberately not used: it is mutable, often blank, frequently duplicated, and sometimes sensitive. The position is recomputed on every render rather than captured when a row is created, because a row survives a move while its position does not.

React exposes the decision as `useArrayActions` so its three widget sets cannot drift, and the name builders are exported for custom widgets. Reorder-control parity is unchanged: the three React sets still expose no reorder button.
