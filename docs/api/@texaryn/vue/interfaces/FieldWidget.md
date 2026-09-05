[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / FieldWidget

# Interface: FieldWidget

## Properties

### aria

> **aria**: `ComputedRef`\<[`FieldAria`](FieldAria.md)\>

***

### description

> **description**: `ComputedRef`\<`string` \| `undefined`\>

***

### descriptionId

> **descriptionId**: `ComputedRef`\<`string`\>

***

### display

> **display**: `ComputedRef`\<`string` \| `number`\>

***

### errorId

> **errorId**: `ComputedRef`\<`string`\>

***

### errors

> **errors**: `ComputedRef`\<readonly [`ValidationError`](../../core/interfaces/ValidationError.md)[]\>

Visible errors only: empty until the display policy says to show them.

***

### invalid

> **invalid**: `ComputedRef`\<`boolean`\>

***

### kind

> **kind**: `ComputedRef`\<[`FieldKind`](../type-aliases/FieldKind.md)\>

***

### label

> **label**: `ComputedRef`\<`string`\>

***

### labelFor

> **labelFor**: `ComputedRef`\<`string`\>

***

### node

> **node**: `ComputedRef`\<[`FieldNode`](../../core/interfaces/FieldNode.md)\>

***

### value

> **value**: `Ref`\<`unknown`\>

## Methods

### onBlur()

> **onBlur**(): `void`

#### Returns

`void`

***

### setRaw()

> **setRaw**(`raw`): `void`

#### Parameters

##### raw

`string`

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
