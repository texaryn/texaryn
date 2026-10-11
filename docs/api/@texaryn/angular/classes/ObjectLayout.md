[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/angular](../README.md) / ObjectLayout

# Class: ObjectLayout

## Constructors

### Constructor

> **new ObjectLayout**(): `ObjectLayout`

#### Returns

`ObjectLayout`

## Properties

### childKey

> `readonly` **childKey**: (`node`) => `string` = `objectChildKey`

The key a binding gives an object's child: its property name, which a recompile that renumbers node ids keeps.

#### Parameters

##### node

[`UINode`](../../core/type-aliases/UINode.md)

#### Returns

`string`

***

### children

> `readonly` **children**: `Signal`\<[`UINode`](../../core/type-aliases/UINode.md)[]\>

***

### currentNode

> `readonly` **currentNode**: `Signal`\<[`ContainerNode`](../../core/interfaces/ContainerNode.md)\>

***

### expandActions

> `readonly` **expandActions**: `Signal`\<`object`[]\>

***

### node

> `readonly` **node**: `InputSignal`\<[`UINode`](../../core/type-aliases/UINode.md)\>

## Methods

### expand()

> **expand**(`targetToken`): `void`

#### Parameters

##### targetToken

`string`

#### Returns

`void`
