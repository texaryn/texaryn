[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / NodeProjection

# Interface: NodeProjection

## Properties

### active

> **active**: `boolean`

***

### annotations

> **annotations**: [`AnnotationSet`](AnnotationSet.md)

***

### children?

> `optional` **children?**: [`ChildProjection`](ChildProjection.md)[]

***

### constraints

> **constraints**: [`FieldConstraints`](FieldConstraints.md)

***

### enumValues?

> `optional` **enumValues?**: [`EnumOption`](EnumOption.md)[]

***

### format?

> `optional` **format?**: `string`

***

### itemAnnotations?

> `optional` **itemAnnotations?**: [`AnnotationSet`](AnnotationSet.md)

Annotations of an array's item template, for arrays only.

A row's own node carries these once it exists, but a renderer needs them
before that: an empty array still has an add control to name, and that is
where naming it matters most. Optional, so an adapter that cannot supply
them stays valid.

***

### type

> **type**: [`JsonSchemaType`](../type-aliases/JsonSchemaType.md)

The shape a renderer should present, which is not an assertion about the
instance's JSON Schema type.

For a schema declaring `type`, the two coincide. For one that does not,
an adapter may still derive a shape from the schema's structural keywords,
and doing so changes nothing about validation: `{ properties: {...} }`
projects as an object and continues to accept a string, because the object
keywords are inapplicable to one.
