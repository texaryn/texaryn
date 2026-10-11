[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / TableNode

# Interface: TableNode

## Extends

- [`DisplayNodeBase`](DisplayNodeBase.md)

## Properties

### annotations

> **annotations**: [`NodeAnnotations`](NodeAnnotations.md)

#### Inherited from

[`DisplayNodeBase`](DisplayNodeBase.md).[`annotations`](DisplayNodeBase.md#annotations)

***

### collectionId

> **collectionId**: `string`

***

### columns

> **columns**: [`TableColumn`](TableColumn.md)[]

***

### dataPointer

> **dataPointer**: [`JsonPointer`](../type-aliases/JsonPointer.md)

***

### id

> **id**: [`NodeId`](../type-aliases/NodeId.md)

#### Inherited from

[`DisplayNodeBase`](DisplayNodeBase.md).[`id`](DisplayNodeBase.md#id)

***

### parentId

> **parentId**: [`NodeId`](../type-aliases/NodeId.md) \| `null`

#### Inherited from

[`DisplayNodeBase`](DisplayNodeBase.md).[`parentId`](DisplayNodeBase.md#parentid)

***

### rowKeyPointer?

> `optional` **rowKeyPointer?**: [`JsonPointer`](../type-aliases/JsonPointer.md)

***

### type

> **type**: `"table"`

#### Overrides

[`DisplayNodeBase`](DisplayNodeBase.md).[`type`](DisplayNodeBase.md#type)
