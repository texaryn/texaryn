[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/web-components](../README.md) / DomWidget

# Interface: DomWidget

A widget owns one DOM subtree for one node. `update` may hand it a
different node than it mounted with: after an array move the row keeps
its widget while the positional node underneath changes.

## Properties

### element

> **element**: `HTMLElement`

## Methods

### destroy()

> **destroy**(): `void`

#### Returns

`void`

***

### update()

> **update**(`node`): `void`

#### Parameters

##### node

[`UINode`](../../core/type-aliases/UINode.md)

#### Returns

`void`
