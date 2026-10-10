[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / ProjectionOptions

# Interface: ProjectionOptions

Optional view state for schema projection.

## Properties

### boundaryGeneration?

> `optional` **boundaryGeneration?**: `number`

Changes when instance pointers can refer to different logical array items.
Adapters include it in boundary tokens so a delayed action from an earlier
array shape is rejected.

***

### expandedBoundaryTokens?

> `optional` **expandedBoundaryTokens?**: `ReadonlySet`\<`string`\>

Tokens from the current projection's boundary targets that should be admitted
past their recursion or budget boundary. Expansion reveals view nodes only. It
does not write data or affect validation and initialization.
