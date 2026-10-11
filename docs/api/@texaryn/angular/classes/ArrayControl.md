[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/angular](../README.md) / ArrayControl

# Class: ArrayControl

## Constructors

### Constructor

> **new ArrayControl**(): `ArrayControl`

#### Returns

`ArrayControl`

## Properties

### array

> `readonly` **array**: [`FieldArrayBinding`](../interfaces/FieldArrayBinding.md)

***

### canDrag

> `readonly` **canDrag**: `Signal`\<`boolean`\>

***

### context

> `readonly` **context**: [`FormContext`](../interfaces/FormContext.md)

***

### currentArray

> `readonly` **currentArray**: `Signal`\<[`ContainerNode`](../../core/interfaces/ContainerNode.md)\>

***

### messages

> `readonly` **messages**: `Signal`\<[`FormMessages`](../../core/interfaces/FormMessages.md)\>

***

### node

> `readonly` **node**: `InputSignal`\<[`UINode`](../../core/type-aliases/UINode.md)\>

## Methods

### dragLeave()

> **dragLeave**(`event`): `void`

#### Parameters

##### event

`DragEvent`

#### Returns

`void`

***

### dragOver()

> **dragOver**(`event`, `itemId`): `void`

#### Parameters

##### event

`DragEvent`

##### itemId

[`StableItemId`](../../core/type-aliases/StableItemId.md)

#### Returns

`void`

***

### drop()

> **drop**(`event`, `itemId`): `void`

#### Parameters

##### event

`DragEvent`

##### itemId

[`StableItemId`](../../core/type-aliases/StableItemId.md)

#### Returns

`void`

***

### endDrag()

> **endDrag**(`event`): `void`

#### Parameters

##### event

`DragEvent`

#### Returns

`void`

***

### itemTitle()

> **itemTitle**(`nodeId`): `string` \| `undefined`

#### Parameters

##### nodeId

`string` \| `undefined`

#### Returns

`string` \| `undefined`

***

### move()

> **move**(`event`, `from`, `to`, `nextDirection`, `restoreAtBoundary`): `void`

#### Parameters

##### event

`MouseEvent`

##### from

`number`

##### to

`number`

##### nextDirection

`"up"` \| `"down"`

##### restoreAtBoundary

`boolean`

#### Returns

`void`

***

### startDrag()

> **startDrag**(`event`, `itemId`): `void`

#### Parameters

##### event

`DragEvent`

##### itemId

[`StableItemId`](../../core/type-aliases/StableItemId.md)

#### Returns

`void`
