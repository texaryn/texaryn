[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / ChildProjection

# Interface: ChildProjection

## Properties

### key

> **key**: `string`

***

### pointer

> **pointer**: [`JsonPointer`](../type-aliases/JsonPointer.md)

***

### provisionalRequired?

> `optional` **provisionalRequired?**: `boolean`

Whether the branch the projection provisionally selected demands it.

The same split as `NodeProjection.provisional`, for the same reason.
Exposing a provisionally selected branch's field while reporting it
optional would say the form does not need what the validator will demand
the moment the branch applies, which is half a model rather than a
conservative one.

Absent means false.

***

### required

> **required**: `boolean`

Whether JSON Schema evaluation demands this property of the current data.
