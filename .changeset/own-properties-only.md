---
'@texaryn/core': patch
---

Stops the pointer helpers treating JavaScript's inherited properties as members
of the JSON document.

Both walked with `current[key]`, so `{}` appeared to have `constructor`,
`toString` and a `__proto__` leading out of the document. `getAtPointer({}, '/constructor')`
returned a function rather than `undefined`, and a deeper pointer through
`/__proto__` surfaced prototype members as if they were the instance's data.

The write side turned that into a visible failure. `"constructor"` is a legal
JSON Schema property name, and since the pointer write began refusing to write
through a value that cannot hold a property, a function cannot, so a form over
a schema declaring that property could not be filled in:
`setAtPointer({}, '/constructor/name', 'x')` threw instead of creating the
object. It now writes it.

Both helpers change together, because `getAtPointer` is what seeds every node's
initial value and fixing only the writer would leave the reader exposing
inherited members.

Writing `__proto__` lands as an ordinary own property and does not reassign the
prototype, which object spread already guaranteed and is now pinned. An array's
`length` is an own property and is still read; whether a pointer should address
it is a question about array semantics and is tracked separately.
