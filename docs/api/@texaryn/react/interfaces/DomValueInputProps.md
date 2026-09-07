[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / DomValueInputProps

# Interface: DomValueInputProps

Value-shaped surface for text, number, textarea and select controls.

## Extends

- [`DomInputBaseProps`](DomInputBaseProps.md)

## Properties

### aria-describedby?

> `optional` **aria-describedby?**: `string`

#### Inherited from

[`DomInputBaseProps`](DomInputBaseProps.md).[`aria-describedby`](DomInputBaseProps.md#aria-describedby)

***

### aria-invalid?

> `optional` **aria-invalid?**: `boolean`

#### Inherited from

[`DomInputBaseProps`](DomInputBaseProps.md).[`aria-invalid`](DomInputBaseProps.md#aria-invalid)

***

### aria-readonly?

> `optional` **aria-readonly?**: `true`

Set only where HTML has no native `readonly`, which is every control but
text, number and textarea. Those carry the native attribute instead, on
the value surface below.

#### Inherited from

[`DomInputBaseProps`](DomInputBaseProps.md).[`aria-readonly`](DomInputBaseProps.md#aria-readonly)

***

### aria-required

> **aria-required**: `boolean`

#### Inherited from

[`DomInputBaseProps`](DomInputBaseProps.md).[`aria-required`](DomInputBaseProps.md#aria-required)

***

### disabled

> **disabled**: `boolean`

#### Inherited from

[`DomInputBaseProps`](DomInputBaseProps.md).[`disabled`](DomInputBaseProps.md#disabled)

***

### id

> **id**: `string`

#### Inherited from

[`DomInputBaseProps`](DomInputBaseProps.md).[`id`](DomInputBaseProps.md#id)

***

### name

> **name**: `string`

#### Inherited from

[`DomInputBaseProps`](DomInputBaseProps.md).[`name`](DomInputBaseProps.md#name)

***

### placeholder?

> `optional` **placeholder?**: `string`

#### Inherited from

[`DomInputBaseProps`](DomInputBaseProps.md).[`placeholder`](DomInputBaseProps.md#placeholder)

***

### readOnly?

> `optional` **readOnly?**: `boolean`

***

### value

> **value**: `string` \| `number`

## Methods

### onBlur()

> **onBlur**(): `void`

#### Returns

`void`

#### Inherited from

[`DomInputBaseProps`](DomInputBaseProps.md).[`onBlur`](DomInputBaseProps.md#onblur)

***

### onChange()

> **onChange**(`event`): `void`

#### Parameters

##### event

###### target

\{ `value`: `string`; \}

###### target.value

`string`

#### Returns

`void`
