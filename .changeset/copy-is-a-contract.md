---
'@texaryn/core': minor
---

States the copy the built-in widgets invent as one contract, `FormMessages`,
with `englishMessages` as the default and `mergeMessages` for rewording one
message over a base.

Each message is a function returning what the control needs, because the
English already drops its container clause when an array has no title and a
template cannot say that without conditional syntax. An action returns both its
visible label and its accessible name, since the second contains the first and
two independent entries would let a translation break that. A locale implements
the whole interface, so a message added later fails a translated application at
compile time rather than leaking one English control into it.

Nothing under the runtime imports the module; the runtime does not know copy
exists.
