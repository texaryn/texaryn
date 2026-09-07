[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / ArrayMeta

# Interface: ArrayMeta

## Properties

### canAdd

> **canAdd**: `boolean`

***

### canRemove

> **canRemove**: `boolean`

***

### canReorder

> **canReorder**: `boolean`

***

### identityKey

> **identityKey**: [`IdentityKey`](../type-aliases/IdentityKey.md)

Addresses this logical array container across recompiles; stable for its lifetime and otherwise opaque.

***

### itemIds

> **itemIds**: [`StableItemId`](../type-aliases/StableItemId.md)[]

***

### itemKey?

> `optional` **itemKey?**: [`JsonPointer`](../type-aliases/JsonPointer.md)

***

### itemTitle?

> `optional` **itemTitle?**: `string`

Title of the item template, so an add control can be named before any row exists.

***

### maxItems?

> `optional` **maxItems?**: `number`

***

### minItems?

> `optional` **minItems?**: `number`
