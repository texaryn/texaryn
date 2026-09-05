[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / WidgetComponent

# Type Alias: WidgetComponent

> **WidgetComponent** = `Component`\<\{ `node`: [`UINode`](../../core/type-aliases/UINode.md); \}\>

A widget receives only the node it renders, matching React's contract,
because `RendererRegistry<T>` fixes the widget prop shape. Everything else
a container needs (the document, the registry) arrives through inject.
