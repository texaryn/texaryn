[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/angular](../README.md) / FieldWidget

# Interface: FieldWidget

## Properties

### aria

> **aria**: `Signal`\<[`FieldAria`](FieldAria.md)\>

***

### description

> **description**: `Signal`\<`string` \| `undefined`\>

***

### descriptionId

> **descriptionId**: `Signal`\<`string`\>

***

### display

> **display**: `Signal`\<`string` \| `number`\>

***

### errorId

> **errorId**: `Signal`\<`string`\>

***

### errors

> **errors**: `Signal`\<readonly [`ValidationError`](../../core/interfaces/ValidationError.md)[]\>

***

### invalid

> **invalid**: `Signal`\<`boolean`\>

***

### kind

> **kind**: `Signal`\<[`FieldKind`](../type-aliases/FieldKind.md)\>

***

### label

> **label**: `Signal`\<`string`\>

***

### labelFor

> **labelFor**: `Signal`\<`string`\>

***

### messages

> **messages**: `Signal`\<[`FormMessages`](../../core/interfaces/FormMessages.md)\>

***

### node

> **node**: `Signal`\<[`FieldNode`](../../core/interfaces/FieldNode.md)\>

***

### value

> **value**: `Signal`\<`unknown`\>

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
