[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / ArrayHints

# Interface: ArrayHints

## Extends

- [`FieldHints`](FieldHints.md)

## Properties

### canReorder?

> `optional` **canReorder?**: `boolean`

***

### ~~colSpan?~~

> `optional` **colSpan?**: `number`

#### Deprecated

Never applied, and not planned. Grid semantics need a layout
contract that does not exist yet, and inventing one through a single
field would settle that design by accident. Remove in the next major.

#### Inherited from

[`FieldHints`](FieldHints.md).[`colSpan`](FieldHints.md#colspan)

***

### helpText?

> `optional` **helpText?**: `string`

#### Inherited from

[`FieldHints`](FieldHints.md).[`helpText`](FieldHints.md#helptext)

***

### ~~hidden?~~

> `optional` **hidden?**: `boolean`

#### Deprecated

Never applied. Do not wire this without first deciding what a
hidden field does about validation, submission, active state and retained
data. Texaryn already has active and inactive semantics from schema
evaluation, and a second visibility concept that ignores them would
conflict with it. Remove in the next major, or replace it once a
visibility contract exists.

#### Inherited from

[`FieldHints`](FieldHints.md).[`hidden`](FieldHints.md#hidden)

***

### itemKey?

> `optional` **itemKey?**: [`JsonPointer`](../type-aliases/JsonPointer.md)

***

### order?

> `optional` **order?**: `number`

Presentation order among siblings. Lower comes first; a field without one
keeps its schema position, and equal values keep schema order. It orders
siblings and nothing else: it is not a layout system, and array items are
unaffected because their order is their data order.

#### Inherited from

[`FieldHints`](FieldHints.md).[`order`](FieldHints.md#order)

***

### placeholder?

> `optional` **placeholder?**: `string`

#### Inherited from

[`FieldHints`](FieldHints.md).[`placeholder`](FieldHints.md#placeholder)

***

### validationTrigger?

> `optional` **validationTrigger?**: `"submit"` \| `"blur"` \| `"change"`

#### Inherited from

[`FieldHints`](FieldHints.md).[`validationTrigger`](FieldHints.md#validationtrigger)

***

### widget?

> `optional` **widget?**: `string`

#### Inherited from

[`FieldHints`](FieldHints.md).[`widget`](FieldHints.md#widget)
