[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / provideRendererRegistry

# Function: provideRendererRegistry()

> **provideRendererRegistry**(`registry`): `void`

The registry is provided as a computed rather than a value, so a caller
that swaps renderers re-resolves the tree it already has.

Providing the value itself would freeze the tree on whichever renderer was
selected when it mounted. React gets this free by re-providing on every
render; Vue provides once, so the reactivity has to be in what is provided.
The playground switches renderer without remounting the form, because the
runtime belongs to the example rather than to the presentation over it.

## Parameters

### registry

`MaybeRefOrGetter`\<[`RendererRegistry`](../../core/interfaces/RendererRegistry.md)\<[`WidgetComponent`](../type-aliases/WidgetComponent.md)\>\>

## Returns

`void`
