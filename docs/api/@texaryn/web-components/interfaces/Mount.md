[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/web-components](../README.md) / Mount

# Interface: Mount

## Properties

### idPrefix

> `readonly` **idPrefix**: `string`

***

### messages

> `readonly` **messages**: [`FormMessages`](../../core/interfaces/FormMessages.md)

The set in force, after any setMessages.

***

### runtime

> `readonly` **runtime**: [`FormRuntime`](../../core/interfaces/FormRuntime.md)

## Methods

### setMessages()

> **setMessages**(`messages`): `void`

A locale change recompiles no document, so this reconciles in place; unmounting would drop focus and caret.

#### Parameters

##### messages

[`FormMessages`](../../core/interfaces/FormMessages.md)

#### Returns

`void`

***

### unmount()

> **unmount**(): `void`

#### Returns

`void`
