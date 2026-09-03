[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / WidgetComponent

# Type Alias: WidgetComponent

> **WidgetComponent** = `ComponentType`\<\{ `node`: [`UINode`](../../core/type-aliases/UINode.md); \}\>

A widget component only ever receives the node it renders. Container
widgets recover the document and registry from RendererContext instead,
because RendererRegistry<T> fixes the widget prop shape to `{ node }`.
