---
'@texaryn/core': minor
---

Creates every missing parent level on a write, instead of one and then
throwing.

`setAtPointer` created exactly one absent level and raised a `TypeError` on
two, because it read the child before recursing and reading a missing level
threw. The last segment tolerated absence, since `{ ...undefined }` is `{}`,
which is why one level worked and two did not. A form built with
`initialData: {}` over a schema nested two levels deep therefore threw out of
`dispatch` on the first keystroke in that field, and `dispatch` returns `void`
from an event handler, so the exception landed in the host's render with
nothing able to handle it. `setAtPointer({}, '/a/b/c/d', 1)` now returns four
nested objects, and an absent or `null` level is created at any depth.

One case refuses rather than guessing, and it is a behaviour change beyond the
fix. A missing level whose key is an array index would have to become `[]`, and
a JSON Pointer cannot say whether `/rows/0` means an array or an object keyed
`"0"`. `setAtPointer({}, '/rows/0', 'x')` previously returned
`{ rows: { '0': 'x' } }`, quietly choosing one of the two; it now throws,
naming the segment. Writing into an array that already exists is unchanged.

No runtime path reaches that refusal: every array command writes the whole
array at the container's own pointer, and item nodes are minted only from rows
already present in the data, so the level above an index is never the missing
one. It is reachable by a host calling the exported helper directly, which is
where either guess would have produced a shape the schema may not describe.
