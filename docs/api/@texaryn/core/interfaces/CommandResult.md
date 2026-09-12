[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / CommandResult

# Interface: CommandResult

## Properties

### effects

> **effects**: [`Effect`](../type-aliases/Effect.md)[]

***

### nextState

> **nextState**: [`RuntimeState`](RuntimeState.md)

***

### provisional?

> `optional` **provisional?**: readonly [`JsonPointer`](../type-aliases/JsonPointer.md)[]

Locations the command created without a value being stated for them.

Today this is the row an `InsertItem` with no `value` adds. The element in
the data is `null`, because an array cannot hold a hole and `undefined` is
not JSON, and that `null` is indistinguishable from one a caller passed
explicitly. An initialization policy needs the difference, so the handler
says which it was rather than leaving the value to be interpreted.

Reported here rather than derived by the caller because only the handler
knows the command was applied: an out-of-range index is a no-op, and naming
a location it declined to create would invite filling a row that does not
exist.
