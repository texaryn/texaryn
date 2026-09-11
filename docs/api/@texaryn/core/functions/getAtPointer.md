[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / getAtPointer

# Function: getAtPointer()

> **getAtPointer**(`data`, `pointer`): `unknown`

The value at `pointer`, or `undefined`.

Total: any pointer that does not address an own member of a container on the
path yields `undefined` rather than throwing. That includes a token that
could not index an array, such as `/01` or `/-`, which address nothing.
`setAtPointer` throws for those instead, because writing to a location that
cannot exist is a mistake while reading one is just a miss.

## Parameters

### data

`unknown`

### pointer

[`JsonPointer`](../type-aliases/JsonPointer.md)

## Returns

`unknown`
