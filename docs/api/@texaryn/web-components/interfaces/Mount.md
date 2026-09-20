[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/web-components](../README.md) / Mount

# Interface: Mount

## Methods

### setMessages()

> **setMessages**(`messages`): `void`

A locale change recompiles no document, so nothing would re-render on its own. This replaces the set and reconciles the mounted tree in place: no unmount, so focus, selection and caret position survive.

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
