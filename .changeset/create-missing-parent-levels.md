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

A missing level is created as an object whatever its key looks like, including
a numeric one. A numeric segment does not imply an array: an object property
may be named `"0"`, and the projection builds `/rows/0` for it from the
property name. Writing into an array that already exists is unchanged, and an
array that has to be created is the caller's to create.

Both refusals also name the offending location with a correctly escaped
pointer. `parsePointer` unescapes, so rebuilding a pointer from its segments
without re-escaping printed `/a/b` for the single key `a/b`, and a caller who
copied that pointer out of the message would have addressed a different
location. The writes themselves were always correct; only the message was wrong.

Nor does anything need such a level to become an array: an array item's pointer
exists only once its row is in the data, which means its array already exists,
so the level above an index is never the missing one.
