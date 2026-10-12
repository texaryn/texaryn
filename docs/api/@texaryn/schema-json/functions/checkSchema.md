[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/schema-json](../README.md) / checkSchema

# Function: checkSchema()

> **checkSchema**(`schema`, `config?`): `Promise`\<[`SchemaIssue`](../interfaces/SchemaIssue.md)[]\>

Returns the schema's own errors as JSON Pointers, without building an adapter. Rejects like `createJsonSchemaAdapter` for a same-location `$ref` cycle (`SameLocationCycleError`) or a `resolveResource` that cannot supply a schema (`SchemaResourceResolutionError`).

## Parameters

### schema

`unknown`

### config?

[`AdapterConfig`](../interfaces/AdapterConfig.md)

## Returns

`Promise`\<[`SchemaIssue`](../interfaces/SchemaIssue.md)[]\>
