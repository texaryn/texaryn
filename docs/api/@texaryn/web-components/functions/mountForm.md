[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/web-components](../README.md) / mountForm

# Function: mountForm()

> **mountForm**(`container`, `runtime`, `registry`, `idPrefix`): [`Mount`](../interfaces/Mount.md)

Renders a runtime's document into a container and follows every recompile
by updating the root binding in place. The runtime is borrowed: unmounting
releases subscriptions and DOM, never the runtime.

## Parameters

### container

`HTMLElement`

### runtime

[`FormRuntime`](../../core/interfaces/FormRuntime.md)

### registry

[`RendererRegistry`](../../core/interfaces/RendererRegistry.md)\<[`WidgetFactory`](../type-aliases/WidgetFactory.md)\>

### idPrefix

`string`

## Returns

[`Mount`](../interfaces/Mount.md)
