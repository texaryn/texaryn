[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / ContainerNode

# Interface: ContainerNode

## Extends

- [`NodeBase`](NodeBase.md)

## Properties

### annotations

> **annotations**: [`NodeAnnotations`](NodeAnnotations.md)

#### Inherited from

[`NodeBase`](NodeBase.md).[`annotations`](NodeBase.md#annotations)

***

### arrayMeta?

> `optional` **arrayMeta?**: [`ArrayMeta`](ArrayMeta.md)

***

### children

> **children**: [`NodeId`](../type-aliases/NodeId.md)[]

***

### containerType

> **containerType**: `"object"` \| `"array"` \| `"group"` \| `"layout"`

***

### dataPointer

> **dataPointer**: [`JsonPointer`](../type-aliases/JsonPointer.md) \| `null`

#### Inherited from

[`NodeBase`](NodeBase.md).[`dataPointer`](NodeBase.md#datapointer)

***

### disabled

> **disabled**: `boolean`

#### Inherited from

[`NodeBase`](NodeBase.md).[`disabled`](NodeBase.md#disabled)

***

### id

> **id**: [`NodeId`](../type-aliases/NodeId.md)

#### Inherited from

[`NodeBase`](NodeBase.md).[`id`](NodeBase.md#id)

***

### order

> **order**: `number`

#### Inherited from

[`NodeBase`](NodeBase.md).[`order`](NodeBase.md#order)

***

### parentId

> **parentId**: [`NodeId`](../type-aliases/NodeId.md) \| `null`

#### Inherited from

[`NodeBase`](NodeBase.md).[`parentId`](NodeBase.md#parentid)

***

### type

> **type**: `"container"`

#### Overrides

[`NodeBase`](NodeBase.md).[`type`](NodeBase.md#type)

***

### visible

> **visible**: `boolean`

#### Inherited from

[`NodeBase`](NodeBase.md).[`visible`](NodeBase.md#visible)
