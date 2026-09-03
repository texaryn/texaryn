[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / Effect

# Type Alias: Effect

> **Effect** = \{ `nodeIds`: [`NodeId`](NodeId.md)[]; `trigger`: `"blur"` \| `"change"` \| `"submit"`; `type`: `"validate"`; \} \| \{ `reason`: `"data-changed"` \| `"schema-changed"`; `type`: `"recompile"`; \} \| \{ `actionType`: `string`; `args`: `unknown`; `type`: `"executeAction"`; \} \| \{ `event`: `string`; `payload`: `unknown`; `type`: `"notify"`; \}
