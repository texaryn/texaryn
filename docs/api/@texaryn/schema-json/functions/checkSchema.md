[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/schema-json](../README.md) / checkSchema

# Function: checkSchema()

> **checkSchema**(`schema`, `config?`): `Promise`\<[`SchemaIssue`](../interfaces/SchemaIssue.md)[]\>

Returns the schema's own errors as JSON Pointers into it, without building an adapter.

Rejects, as `createJsonSchemaAdapter` does, for a same-location `$ref` cycle
(`SameLocationCycleError`) and when a configured `resolveResource` cannot supply a
referenced schema (`SchemaResourceResolutionError`), rather than returning issues for them.

## Parameters

### schema

`unknown`

### config?

[`AdapterConfig`](../interfaces/AdapterConfig.md)

## Returns

`Promise`\<[`SchemaIssue`](../interfaces/SchemaIssue.md)[]\>
