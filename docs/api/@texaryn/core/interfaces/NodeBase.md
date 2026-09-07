[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / NodeBase

# Interface: NodeBase

## Extended by

- [`FieldNode`](FieldNode.md)
- [`ContainerNode`](ContainerNode.md)
- [`TextNode`](TextNode.md)
- [`ActionNode`](ActionNode.md)

## Properties

### annotations

> **annotations**: [`NodeAnnotations`](NodeAnnotations.md)

***

### dataPointer

> **dataPointer**: [`JsonPointer`](../type-aliases/JsonPointer.md) \| `null`

***

### disabled

> **disabled**: `boolean`

***

### id

> **id**: [`NodeId`](../type-aliases/NodeId.md)

***

### order

> **order**: `number`

***

### parentId

> **parentId**: [`NodeId`](../type-aliases/NodeId.md) \| `null`

***

### readOnly

> **readOnly**: `boolean`

Effective read-only, inherited from any read-only ancestor. Editing a
descendant changes the ancestor's value, so the restriction has to
cascade. Distinct from `annotations.readOnly`, which is only what the
schema said about this node.

***

### type

> **type**: `string`

***

### visible

> **visible**: `boolean`
