[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/schema-json](../README.md) / SchemaIssue

# Interface: SchemaIssue

A place where a schema itself is invalid, as an RFC 6901 pointer into it.

## Properties

### code

> **code**: `string`

Currently always `schema-error`; more specific codes may be added.

***

### message

> **message**: `string`

***

### pointer

> **pointer**: [`JsonPointer`](../../core/type-aliases/JsonPointer.md)
