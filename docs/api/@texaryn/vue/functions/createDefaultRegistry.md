[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / createDefaultRegistry

# Function: createDefaultRegistry()

> **createDefaultRegistry**(): [`RendererRegistry`](../../core/interfaces/RendererRegistry.md)\<[`WidgetComponent`](../type-aliases/WidgetComponent.md)\>

The same tests and ranks as the React default registry, on purpose. If the
two ever disagree about which widget a node resolves to, the difference is
a renderer's opinion leaking into what the document means.

## Returns

[`RendererRegistry`](../../core/interfaces/RendererRegistry.md)\<[`WidgetComponent`](../type-aliases/WidgetComponent.md)\>
