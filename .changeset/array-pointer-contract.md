---
'@texaryn/core': minor
---

Makes a pointer segment mean the same thing to `setAtPointer` as it does to
`getAtPointer` when the container is an array, and writes down the contract.

The writer coerced the token with `Number(key)` while the reader used it as a
property key, so the two addressed different places. `getAtPointer(['a','b'], '/01')`
was `undefined` while `setAtPointer(['a','b'], '/01', 'x')` wrote element 1.
Worse, `Number('1x')` and `Number('-')` are `NaN`, so those writes set a
property named `"NaN"` on the array, which `JSON.stringify` drops: the value
was accepted, stored, and then silently absent from the submission.

Per RFC 6901 an array token is digits with no leading zero, or `-` for the
position after the last element. A canonical index now writes that element and
`-` appends. Anything else throws.

Two behaviour changes come with it. A non-index token that previously coerced,
such as `/01`, now throws instead of writing a different element. And an index
past the end now throws instead of extending the array, because the gap would
be holes and a hole serializes as `null`, which would submit values no schema
described. An index equal to the length still appends, since that creates no
gap. Objects keyed `"01"` or `"-"` are untouched; this is about arrays.

`setAtPointer` now carries its contract in full, and `getAtPointer` states that
it is total. The asymmetry is deliberate: reading a location that does not
exist yields `undefined`, while writing where nothing can be written is an
error.
