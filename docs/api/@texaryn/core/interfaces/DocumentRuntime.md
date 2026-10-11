[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / DocumentRuntime

# Interface: DocumentRuntime

## Extends

- [`UIDocumentRuntime`](UIDocumentRuntime.md)\<[`UIDocumentV2`](../type-aliases/UIDocumentV2.md), [`JsonValue`](../type-aliases/JsonValue.md)\>

## Properties

### data

> `readonly` **data**: [`Store`](Store.md)\<[`JsonValue`](../type-aliases/JsonValue.md)\>

#### Inherited from

[`UIDocumentRuntime`](UIDocumentRuntime.md).[`data`](UIDocumentRuntime.md#data-1)

***

### document

> `readonly` **document**: [`Store`](Store.md)\<[`UIDocumentV2`](../type-aliases/UIDocumentV2.md)\>

#### Inherited from

[`UIDocumentRuntime`](UIDocumentRuntime.md).[`document`](UIDocumentRuntime.md#document-1)

## Methods

### destroy()

> **destroy**(): `void`

#### Returns

`void`

#### Inherited from

[`UIDocumentRuntime`](UIDocumentRuntime.md).[`destroy`](UIDocumentRuntime.md#destroy)

***

### getCollection()

> **getCollection**(`nodeId`): [`Store`](Store.md)\<readonly [`DocumentCollectionRow`](DocumentCollectionRow.md)[]\> \| `undefined`

#### Parameters

##### nodeId

[`NodeId`](../type-aliases/NodeId.md)

#### Returns

[`Store`](Store.md)\<readonly [`DocumentCollectionRow`](DocumentCollectionRow.md)[]\> \| `undefined`

***

### hasActionHandler()

> **hasActionHandler**(`actionType`): `boolean`

#### Parameters

##### actionType

`string`

#### Returns

`boolean`

***

### invokeAction()

> **invokeAction**(`nodeId`): `Promise`\<`void`\>

#### Parameters

##### nodeId

[`NodeId`](../type-aliases/NodeId.md)

#### Returns

`Promise`\<`void`\>

***

### replaceDocument()

> **replaceDocument**(`document`): `void`

#### Parameters

##### document

`unknown`

#### Returns

`void`

***

### replaceSnapshot()

> **replaceSnapshot**(`document`, `data`): `void`

#### Parameters

##### document

`unknown`

##### data

`unknown`

#### Returns

`void`

***

### setData()

> **setData**(`data`): `void`

#### Parameters

##### data

`unknown`

#### Returns

`void`
