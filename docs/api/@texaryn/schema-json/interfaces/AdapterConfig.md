[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/schema-json](../README.md) / AdapterConfig

# Interface: AdapterConfig

## Extends

- `SchemaResourceOptions`

## Properties

### defaultDialect?

> `optional` **defaultDialect?**: [`Dialect`](../type-aliases/Dialect.md)

***

### maxExternalResources?

> `readonly` `optional` **maxExternalResources?**: `number`

Maximum number of unique external resource retrieval URIs. The default is 128.

#### Inherited from

`SchemaResourceOptions.maxExternalResources`

***

### resolveResource?

> `readonly` `optional` **resolveResource?**: [`SchemaResourceResolver`](../type-aliases/SchemaResourceResolver.md)

Supplies external schemas on the host's terms. Return undefined when the resource is unavailable.

#### Inherited from

`SchemaResourceOptions.resolveResource`
