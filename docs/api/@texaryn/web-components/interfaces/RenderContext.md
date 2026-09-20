[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/web-components](../README.md) / RenderContext

# Interface: RenderContext

## Properties

### idPrefix

> **idPrefix**: `string`

***

### messages

> **messages**: [`FormMessages`](../../core/interfaces/FormMessages.md)

Replaced whole by `Mount.setMessages`; widgets read it on every render rather than capturing it.

***

### registry

> **registry**: [`RendererRegistry`](../../core/interfaces/RendererRegistry.md)\<[`WidgetFactory`](../type-aliases/WidgetFactory.md)\>

***

### runtime

> **runtime**: [`FormRuntime`](../../core/interfaces/FormRuntime.md)

## Methods

### mountChild()

> **mountChild**(`node`): [`NodeBinding`](NodeBinding.md)

#### Parameters

##### node

[`UINode`](../../core/type-aliases/UINode.md)

#### Returns

[`NodeBinding`](NodeBinding.md)
