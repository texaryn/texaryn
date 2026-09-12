[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / DefaultRefusal

# Interface: DefaultRefusal

A default the pass declined to apply. Reported rather than skipped, because an
absent location that nothing explains is the failure mode the applicator depth
cap in #118 taught against.

## Properties

### location

> `readonly` **location**: [`JsonPointer`](../type-aliases/JsonPointer.md)

***

### reason

> `readonly` **reason**: `"non-container-ancestor"` \| `"unknown-container-kind"`
