---
'@texaryn/core': minor
---

Initializes a row inserted with no value, closing #127.

Under `initialization: 'schema-defaults'`, `InsertItem` with no `value` now adds
a row carrying its item defaults: an object item arrives with its declared
properties filled, a scalar item holding the item default. An explicit `value`,
including `null`, is preserved exactly, and with no policy configured the row is
`null` as before.

`cmd.value ?? null` was never wrong about the element it produced. The defect was
that nothing downstream could tell an omitted value from an explicit `null`,
since both arrive as `null`. `CommandResult` therefore gained an optional
`provisional`, naming the locations a command created without a value being
stated for them, and `InsertItem` reports the row it added. The element in the
data is still `null`, because an array cannot hold a hole and `undefined` is not
JSON: the distinction travels beside the data rather than in it, so nothing but
JSON ever reaches the schema port.

Provisional status ends at the first write at or beneath the location. Held for
the run, an item declaring `default: 'seed'` would read as absent on every pass
and be written on every pass, exhausting the budget and discarding everything.
"At or beneath" rather than "at", because an object row is created by a write to
one of its properties.

A row whose seeding does not converge keeps the insert and holds `null`: the
insert establishes no baseline, so ADR-003 keeps it, while the seeding is
transactional and none of it survives.
