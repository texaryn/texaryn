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
