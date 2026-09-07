[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / ActionNode

# Interface: ActionNode

## Extends

- [`NodeBase`](NodeBase.md)

## Properties

### actionArgs?

> `optional` **actionArgs?**: `Record`\<`string`, `unknown`\>

***

### actionType

> **actionType**: `string`

***

### annotations

> **annotations**: [`NodeAnnotations`](NodeAnnotations.md)

#### Inherited from

[`NodeBase`](NodeBase.md).[`annotations`](NodeBase.md#annotations)

***

### buttonRole

> **buttonRole**: `"submit"` \| `"reset"` \| `"button"`

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

### label

> **label**: `string`

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

### readOnly

> **readOnly**: `boolean`

Effective read-only, inherited from any read-only ancestor. Editing a
descendant changes the ancestor's value, so the restriction has to
cascade. Distinct from `annotations.readOnly`, which is only what the
schema said about this node.

#### Inherited from

[`NodeBase`](NodeBase.md).[`readOnly`](NodeBase.md#readonly)

***

### type

> **type**: `"action"`

#### Overrides

[`NodeBase`](NodeBase.md).[`type`](NodeBase.md#type)

***

### visible

> **visible**: `boolean`

#### Inherited from

[`NodeBase`](NodeBase.md).[`visible`](NodeBase.md#visible)
