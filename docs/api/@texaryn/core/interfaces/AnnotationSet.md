[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / AnnotationSet

# Interface: AnnotationSet

## Properties

### default?

> `optional` **default?**: `unknown`

The value the schema declares for a location that has none.

Absent where two or more declarations apply unconditionally and disagree,
with an `ambiguous-default` diagnostic in its place. A single value is
reported where the schema states one; where it states two that disagree,
reporting either would be a merge order presented as an answer, and the
two adapters' merges do not even keep the same one.

***

### deprecated?

> `optional` **deprecated?**: `boolean`

***

### description?

> `optional` **description?**: `string`

***

### examples?

> `optional` **examples?**: `unknown`[]

***

### readOnly?

> `optional` **readOnly?**: `boolean`

***

### title?

> `optional` **title?**: `string`

***

### writeOnly?

> `optional` **writeOnly?**: `boolean`
