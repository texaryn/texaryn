[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / FieldBinding

# Interface: FieldBinding

## Properties

### description

> **description**: `string` \| `undefined`

***

### descriptionProps

> **descriptionProps**: [`DescriptionProps`](DescriptionProps.md)

***

### dirty

> **dirty**: `boolean`

***

### disabled

> **disabled**: `boolean`

***

### domCheckboxProps

> **domCheckboxProps**: [`DomCheckedInputProps`](DomCheckedInputProps.md)

***

### domInputProps

> **domInputProps**: [`DomValueInputProps`](DomValueInputProps.md)

***

### error

> **error**: `string` \| `undefined`

First visible error as `message ?? keyword`.

***

### errorProps

> **errorProps**: [`ErrorProps`](ErrorProps.md)

***

### errors

> **errors**: readonly [`ValidationError`](../../core/interfaces/ValidationError.md)[]

Visible errors only: empty until the field is touched and invalid.

***

### invalid

> **invalid**: `boolean`

***

### label

> **label**: `string`

***

### labelProps

> **labelProps**: [`LabelProps`](LabelProps.md)

***

### node

> **node**: [`FieldNode`](../../core/interfaces/FieldNode.md)

***

### placeholder

> **placeholder**: `string` \| `undefined`

***

### required

> **required**: `boolean`

Derived from the node for adapters. `aria-required` stays owned by getInputProps.

***

### touched

> **touched**: `boolean`

***

### value

> **value**: `unknown`

***

### visible

> **visible**: `boolean`

## Methods

### onBlur()

> **onBlur**(): `void`

#### Returns

`void`

***

### setValue()

> **setValue**(`value`): `void`

#### Parameters

##### value

`unknown`

#### Returns

`void`
