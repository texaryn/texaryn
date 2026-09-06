[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / hasNativeReadOnly

# Function: hasNativeReadOnly()

> **hasNativeReadOnly**(`node`): `boolean`

HTML honours `readonly` on text, number and textarea only. A select or a
checkbox says so through ARIA instead, and the widget refuses the change.
Shared with useFieldBinding so the two public surfaces cannot drift apart.

## Parameters

### node

[`FieldNode`](../../core/interfaces/FieldNode.md)

## Returns

`boolean`
