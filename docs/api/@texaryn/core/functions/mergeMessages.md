[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / mergeMessages

# Function: mergeMessages()

> **mergeMessages**(`base`, `overrides`): [`FormMessages`](../interfaces/FormMessages.md)

Rewording, not translation. A locale implements `FormMessages` whole so a
new message cannot fall back to English unnoticed; this is for the caller
who wants one control worded differently and everything else as the base
says.

## Parameters

### base

[`FormMessages`](../interfaces/FormMessages.md)

### overrides

`Partial`\<[`FormMessages`](../interfaces/FormMessages.md)\>

## Returns

[`FormMessages`](../interfaces/FormMessages.md)
