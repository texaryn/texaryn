[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / NodeRenderer

# Variable: NodeRenderer

> `const` **NodeRenderer**: `DefineComponent`\<`ExtractPropTypes`\<\{ `node`: \{ `required`: `true`; `type`: `PropType`\<[`UINode`](../../core/type-aliases/UINode.md)\>; \}; \}\>, () => `VNode`\<`RendererNode`, `RendererElement`, \{\[`key`: `string`\]: `any`; \}\> \| `null`, \{ \}, \{ \}, \{ \}, `ComponentOptionsMixin`, `ComponentOptionsMixin`, \{ \}, `string`, `PublicProps`, `ToResolvedProps`\<`ExtractPropTypes`\<\{ `node`: \{ `required`: `true`; `type`: `PropType`\<[`UINode`](../../core/type-aliases/UINode.md)\>; \}; \}\>, \{ \}\>, \{ \}, \{ \}, \{ \}, \{ \}, `string`, `ComponentProvideOptions`, `true`, \{ \}, `any`\>

Compiling a schema with `active: false` produces a node with
`visible: false`. That is the source of truth for hiding a node, so it is
read off the node rather than through useField, which would cost a
subscription for a subtree that never renders.
