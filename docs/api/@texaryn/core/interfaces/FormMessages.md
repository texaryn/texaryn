[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / FormMessages

# Interface: FormMessages

Functions, not templates: a sentence with slots encodes one language's word order.

## Methods

### addItem()

> **addItem**(`context`): [`ActionMessage`](ActionMessage.md)

#### Parameters

##### context

[`AddItemContext`](AddItemContext.md)

#### Returns

[`ActionMessage`](ActionMessage.md)

***

### errorSummaryDetail()

> **errorSummaryDetail**(`context`): `string`

The whole text after an item's link, punctuation included.

#### Parameters

##### context

[`ErrorSummaryDetailContext`](ErrorSummaryDetailContext.md)

#### Returns

`string`

***

### errorSummaryHeading()

> **errorSummaryHeading**(`context`): `string`

#### Parameters

##### context

[`ErrorSummaryHeadingContext`](ErrorSummaryHeadingContext.md)

#### Returns

`string`

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
