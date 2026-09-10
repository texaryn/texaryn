---
'@texaryn/core': minor
---

Refuses to write through a value that cannot hold a property, and stops
treating a `null` root as absent.

`setAtPointer` used to spread whatever it found on the path. `{ ...'plain' }` is
`{0:'p',1:'l',2:'a',3:'i',4:'n'}` and `{ ...7 }` is `{}`, so a form whose data
had a scalar where the schema expected an object turned that scalar into
character keys, or discarded it, on the first write to a child. Both produced an
instance no schema described, from data the caller had supplied, and the string
case did it silently. It now throws, naming the pointer being written, the
location of the offending value and its type.

Absent still creates, which is how a nested field is written at all, and `null`
creates with it: `getAtPointer` reads through `null` and `undefined`
identically, so writing agrees with reading, and a schema of
`{ type: ['object', 'null'] }` may legitimately start at `null`.

`createFormRuntime` no longer coerces `initialData: null` to `{}`, and `Reset`
no longer treats `data: null` as no data. Both used `??`, which conflated `null`
with absent while `false`, `0` and `''` survived, so a caller could not express
a `null` instance and which falsy values lived was arbitrary. Both now test for
`undefined`.

A scalar root is unaffected where the schema says the root is the field: writing
at the root pointer replaces the document rather than walking into it. The
refusal is about the write, not about the root.
