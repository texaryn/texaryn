[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / compile

# Function: compile()

> **compile**(`projection`, `data`, `hints?`, `identities?`): [`CompileResult`](../interfaces/CompileResult.md)

Compiles a projection into a document.

`identities` carries array item identity forward from the previous
document. The command handler owns identity: it maintains it directly for
insert, remove and move, and reconciles it whenever data changes. Passing
that map back in lets compilation adopt the result. Omitting it mints a
fresh positional identity, which is only correct for a first compile.

## Parameters

### projection

[`SchemaProjection`](../interfaces/SchemaProjection.md)

### data

`unknown`

### hints?

[`UIHints`](../interfaces/UIHints.md)

### identities?

[`IdentityMap`](../interfaces/IdentityMap.md)

## Returns

[`CompileResult`](../interfaces/CompileResult.md)
