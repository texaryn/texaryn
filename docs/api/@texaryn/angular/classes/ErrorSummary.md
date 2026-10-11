[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/angular](../README.md) / ErrorSummary

# Class: ErrorSummary

## Constructors

### Constructor

> **new ErrorSummary**(): `ErrorSummary`

#### Returns

`ErrorSummary`

## Properties

### errorLabel

> `readonly` **errorLabel**: (`error`) => `string` = `visibleErrorLabel`

#### Parameters

##### error

[`VisibleError`](../../core/interfaces/VisibleError.md)

#### Returns

`string`

***

### errorMessages

> `readonly` **errorMessages**: (`error`) => `string`[] = `visibleErrorMessages`

#### Parameters

##### error

[`VisibleError`](../../core/interfaces/VisibleError.md)

#### Returns

`string`[]

***

### focus

> `readonly` **focus**: `InputSignal`\<`boolean`\>

***

### form

> `readonly` **form**: `InputSignal`\<[`AngularForm`](../interfaces/AngularForm.md)\>

***

### headingId

> `readonly` **headingId**: `Signal`\<`string`\>

***

### idPrefix

> `readonly` **idPrefix**: `InputSignal`\<`string`\>

***

### makeId

> `readonly` **makeId**: (`idPrefix`, `nodeId`, `suffix`) => `string`

#### Parameters

##### idPrefix

`string`

##### nodeId

`string`

##### suffix

`string`

#### Returns

`string`

***

### messages

> `readonly` **messages**: `InputSignal`\<[`FormMessages`](../../core/interfaces/FormMessages.md) \| `undefined`\>

***

### messageSet

> `readonly` **messageSet**: `Signal`\<[`FormMessages`](../../core/interfaces/FormMessages.md)\>
