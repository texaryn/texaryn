[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / RendererRegistry

# Interface: RendererRegistry\<T, Node\>

## Type Parameters

### T

`T` = `unknown`

### Node

`Node` = [`UINode`](../type-aliases/UINode.md)

## Methods

### register()

> **register**(`tester`, `component`): `void`

#### Parameters

##### tester

[`WidgetTester`](WidgetTester.md)\<`Node`\>

##### component

`T`

#### Returns

`void`

***

### resolve()

> **resolve**(`node`): `T` \| `undefined`

#### Parameters

##### node

`Node`

#### Returns

`T` \| `undefined`
