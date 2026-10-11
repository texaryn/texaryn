[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/web-components](../README.md) / DocumentRenderContext

# Interface: DocumentRenderContext

## Properties

### onActionError

> **onActionError**: (`error`) => `void`

#### Parameters

##### error

`unknown`

#### Returns

`void`

***

### registry?

> `optional` **registry?**: [`RendererRegistry`](../../core/interfaces/RendererRegistry.md)\<[`DocumentWidgetFactory`](../type-aliases/DocumentWidgetFactory.md), [`DocumentNode`](../../core/type-aliases/DocumentNode.md)\>

***

### runtime

> **runtime**: [`DocumentRuntime`](../../core/interfaces/DocumentRuntime.md)

## Methods

### mountChild()

> **mountChild**(`node`): [`DocumentNodeBinding`](DocumentNodeBinding.md)

#### Parameters

##### node

[`DocumentNode`](../../core/type-aliases/DocumentNode.md)

#### Returns

[`DocumentNodeBinding`](DocumentNodeBinding.md)
