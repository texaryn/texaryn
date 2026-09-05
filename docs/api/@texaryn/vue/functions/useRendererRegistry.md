[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / useRendererRegistry

# Function: useRendererRegistry()

> **useRendererRegistry**(): `ComputedRef`\<[`RendererRegistry`](../../core/interfaces/RendererRegistry.md)\<[`WidgetComponent`](../type-aliases/WidgetComponent.md)\>\>

Provided once by FormRoot rather than per node.

React re-provides it at every NodeRenderer because a context value has to
sit above the component that reads it in the element tree it builds. Vue's
inject walks the component parent chain, so one provide at the root reaches
every widget however deeply nested, and repeating it per node would create
an injection scope per node for no gain.

## Returns

`ComputedRef`\<[`RendererRegistry`](../../core/interfaces/RendererRegistry.md)\<[`WidgetComponent`](../type-aliases/WidgetComponent.md)\>\>
