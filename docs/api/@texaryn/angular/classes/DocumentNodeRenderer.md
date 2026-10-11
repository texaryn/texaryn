[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/angular](../README.md) / DocumentNodeRenderer

# Class: DocumentNodeRenderer

## Constructors

### Constructor

> **new DocumentNodeRenderer**(): `DocumentNodeRenderer`

#### Returns

`DocumentNodeRenderer`

## Properties

### component

> `readonly` **component**: `Signal`\<`Type`\<[`AngularDocumentWidget`](../interfaces/AngularDocumentWidget.md)\> \| `undefined`\>

***

### componentInputs

> `readonly` **componentInputs**: `Signal`\<\{ `node`: [`DocumentNode`](../../core/type-aliases/DocumentNode.md); `runtime`: [`DocumentRuntime`](../../core/interfaces/DocumentRuntime.md); \}\>

***

### node

> `readonly` **node**: `Signal`\<[`DocumentNode`](../../core/type-aliases/DocumentNode.md)\>

***

### nodeId

> `readonly` **nodeId**: `InputSignal`\<[`NodeId`](../../core/type-aliases/NodeId.md)\>

## Methods

### invoke()

> **invoke**(`node`): `void`

#### Parameters

##### node

[`DisplayActionNode`](../../core/interfaces/DisplayActionNode.md)

#### Returns

`void`
