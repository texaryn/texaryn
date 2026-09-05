[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / FieldAria

# Interface: FieldAria

The accessible attribute surface for a field, derived from the node and its
current state.

This is a deliberate reimplementation of `@texaryn/react`'s prop getters
rather than an import of them: this package must not depend on the React
binding, and the slice exists to find out what the two genuinely share.
Nothing here is Vue specific, which makes it the first candidate for a
framework-neutral home. That move waits for evidence from a second
consumer, not from this file existing.

## Properties

### aria-describedby?

> `optional` **aria-describedby?**: `string`

***

### aria-invalid?

> `optional` **aria-invalid?**: `boolean`

***

### aria-required

> **aria-required**: `boolean`

***

### disabled

> **disabled**: `boolean`

***

### id

> **id**: `string`

***

### name

> **name**: `string`

***

### placeholder?

> `optional` **placeholder?**: `string`
