[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / ActionMessage

# Interface: ActionMessage

The two surfaces of one control. `accessibleName` must contain `label`,
because a speech-input user says the word they can see and expects the
control to respond. The renderer decides which element carries which.

## Properties

### accessibleName

> **accessibleName**: `string`

The control's accessible name. Contains `label`.

***

### label

> **label**: `string`

The word on the control. Short, because it repeats down a list.
