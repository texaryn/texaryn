[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / ArrayActions

# Interface: ArrayActions

## Properties

### add

> **add**: [`ActionMessage`](../../core/interfaces/ActionMessage.md)

Both surfaces of the control that appends a row.

## Methods

### moveDown()

> **moveDown**(`position`, `item`): [`ActionMessage`](../../core/interfaces/ActionMessage.md)

Both surfaces of the control that moves this row one position down.

#### Parameters

##### position

`number`

##### item

[`UINode`](../../core/type-aliases/UINode.md) \| `undefined`

#### Returns

[`ActionMessage`](../../core/interfaces/ActionMessage.md)

***

### moveUp()

> **moveUp**(`position`, `item`): [`ActionMessage`](../../core/interfaces/ActionMessage.md)

Both surfaces of the control that moves this row one position up.

#### Parameters

##### position

`number`

##### item

[`UINode`](../../core/type-aliases/UINode.md) \| `undefined`

#### Returns

[`ActionMessage`](../../core/interfaces/ActionMessage.md)

***

### remove()

> **remove**(`position`, `item`): [`ActionMessage`](../../core/interfaces/ActionMessage.md)

Both surfaces of the control that removes the row at this position.

#### Parameters

##### position

`number`

##### item

[`UINode`](../../core/type-aliases/UINode.md) \| `undefined`

#### Returns

[`ActionMessage`](../../core/interfaces/ActionMessage.md)
