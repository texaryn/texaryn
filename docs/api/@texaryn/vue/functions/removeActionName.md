[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / removeActionName

# Function: removeActionName()

> **removeActionName**(`position`, `itemTitle`, `arrayTitle`): `string`

Accessible names for the controls an array renders.

A deliberate reimplementation of `@texaryn/react`'s helper rather than an
import of it, for the same reason `fieldAria` is: this package must not
depend on the React binding. Nothing here is Vue specific, so it is a
candidate for a framework-neutral home once a third consumer asks for it.

The name carries the current 1-based position, because that is what a person
means by "the second contact"; the stable item id is implementation identity.
The row's own value is deliberately unused: mutable, often blank, frequently
duplicated, sometimes sensitive.

## Parameters

### position

`number`

### itemTitle

`string` \| `undefined`

### arrayTitle

`string` \| `undefined`

## Returns

`string`
