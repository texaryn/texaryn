[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/web-components](../README.md) / createDefaultRegistry

# Function: createDefaultRegistry()

> **createDefaultRegistry**(): [`RendererRegistry`](../../core/interfaces/RendererRegistry.md)\<[`WidgetFactory`](../type-aliases/WidgetFactory.md)\>

The same tests and ranks as the React and Vue default registries, on
purpose. If the three ever disagree about which widget a node resolves to,
the difference is a renderer's opinion leaking into what the document means.

## Returns

[`RendererRegistry`](../../core/interfaces/RendererRegistry.md)\<[`WidgetFactory`](../type-aliases/WidgetFactory.md)\>
