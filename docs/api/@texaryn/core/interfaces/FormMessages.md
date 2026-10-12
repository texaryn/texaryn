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

### expandBoundary()?

> `optional` **expandBoundary**(`context`): [`ActionMessage`](ActionMessage.md)

Optional localized label for boundary expansion controls.

#### Parameters

##### context

[`ExpandBoundaryContext`](ExpandBoundaryContext.md)

#### Returns

[`ActionMessage`](ActionMessage.md)

***

### fieldLabel()?

> `optional` **fieldLabel**(`context`): `string`

Optional localized fallback for a field label without a schema title.

#### Parameters

##### context

[`FieldLabelContext`](FieldLabelContext.md)

#### Returns

`string`

***

### moveItemDown()

> **moveItemDown**(`context`): [`ActionMessage`](ActionMessage.md)

#### Parameters

##### context

[`ItemActionContext`](ItemActionContext.md)

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

***

### validationMessage()

> **validationMessage**(`error`): `string`

Localized presentation for one validation error. Evaluator message text is diagnostic only.

#### Parameters

##### error

[`ValidationError`](ValidationError.md)

#### Returns

`string`
