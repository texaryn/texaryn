[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/svelte](../README.md) / SvelteFieldBinding

# Interface: SvelteFieldBinding

## Properties

### aria

> **aria**: `Readable`\<[`FieldAria`](FieldAria.md) \| `undefined`\>

***

### description

> **description**: `Readable`\<`string` \| `undefined`\>

***

### descriptionId

> **descriptionId**: `Readable`\<`string`\>

***

### dirty

> **dirty**: `Readable`\<`boolean`\>

***

### disabled

> **disabled**: `Readable`\<`boolean`\>

***

### display

> **display**: `Readable`\<`string` \| `number`\>

***

### errorId

> **errorId**: `Readable`\<`string`\>

***

### errors

> **errors**: `Readable`\<[`ValidationError`](../../core/interfaces/ValidationError.md)[]\>

***

### kind

> **kind**: `Readable`\<[`FieldKind`](../type-aliases/FieldKind.md)\>

***

### label

> **label**: `Readable`\<`string`\>

***

### labelFor

> **labelFor**: `Readable`\<`string`\>

***

### messages

> **messages**: `Readable`\<[`FormMessages`](../../core/interfaces/FormMessages.md)\>

***

### node

> **node**: `Readable`\<[`FieldNode`](../../core/interfaces/FieldNode.md) \| `undefined`\>

***

### showErrors

> **showErrors**: `Readable`\<`boolean`\>

***

### touched

> **touched**: `Readable`\<`boolean`\>

***

### value

> **value**: `Readable`\<`unknown`\>

***

### visible

> **visible**: `Readable`\<`boolean`\>

***

### visibleErrors

> **visibleErrors**: `Readable`\<readonly [`ValidationError`](../../core/interfaces/ValidationError.md)[]\>

## Methods

### onBlur()

> **onBlur**(): `void`

#### Returns

`void`

***

### setRaw()

> **setRaw**(`raw`, `enumToken?`): `void`

#### Parameters

##### raw

`string`

##### enumToken?

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
