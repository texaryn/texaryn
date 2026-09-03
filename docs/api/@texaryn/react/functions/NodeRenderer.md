[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / NodeRenderer

# Function: NodeRenderer()

> **NodeRenderer**(`__namedParameters`): `Element` \| `null`

Compiling a schema with `active: false` produces a node with
`visible: false`. That is the source of truth for hiding a node, so it is
read straight off the document rather than through useField, which would
cost a hook subscription for a subtree that never renders.

## Parameters

### \_\_namedParameters

[`NodeRendererProps`](../interfaces/NodeRendererProps.md)

## Returns

`Element` \| `null`
