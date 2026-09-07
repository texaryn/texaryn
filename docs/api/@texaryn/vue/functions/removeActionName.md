[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / removeActionName

# Function: removeActionName()

> **removeActionName**(`position`, `itemTitle`, `arrayTitle`): `string`

Accessible names for the controls an array renders.

A deliberate reimplementation of `@texaryn/react`'s helper rather than an
import of it, for the same reason `fieldAria` is: this package must not
depend on the React binding. Web Components carries the third copy. Nothing
here is Vue specific, and extraction waits for a boundary rather than a copy
count: configurable or localized wording, or another renderer-neutral
presentation rule that needs the same home. Putting English control copy in
the headless runtime would be the wrong home.

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
