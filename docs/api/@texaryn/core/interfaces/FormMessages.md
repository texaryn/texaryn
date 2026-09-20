[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / FormMessages

# Interface: FormMessages

Every piece of copy the built-in widgets invent. A locale implements the
whole interface, so a message added here fails a translated application at
compile time rather than leaking one English control into it.

Functions rather than templates, because a sentence with slots encodes
English word order. The English already drops its container clause entirely
when the array has no title; another language decides that for itself.

## Methods

### addItem()

> **addItem**(`context`): [`ActionMessage`](ActionMessage.md)

#### Parameters

##### context

[`AddItemContext`](AddItemContext.md)

#### Returns

[`ActionMessage`](ActionMessage.md)

***

### moveItemUp()

> **moveItemUp**(`context`): [`ActionMessage`](ActionMessage.md)

#### Parameters

##### context

[`ItemActionContext`](ItemActionContext.md)

#### Returns

[`ActionMessage`](ActionMessage.md)

***

### removeItem()

> **removeItem**(`context`): [`ActionMessage`](ActionMessage.md)

#### Parameters

##### context

[`ItemActionContext`](ItemActionContext.md)

#### Returns

[`ActionMessage`](ActionMessage.md)

***

### requiredIndicator()

> **requiredIndicator**(): [`IndicatorMessage`](IndicatorMessage.md)

#### Returns

[`IndicatorMessage`](IndicatorMessage.md)
