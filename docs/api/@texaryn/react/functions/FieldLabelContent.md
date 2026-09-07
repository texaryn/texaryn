[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / FieldLabelContent

# Function: FieldLabelContent()

> **FieldLabelContent**(`__namedParameters`): `Element`

Label content for a field: the schema's label, plus a visible required
indicator that is kept out of the accessible name.

Three separate channels carry one fact, and they must not be collapsed. The
sighted user reads "(required)". The accessible name stays the label alone,
because `aria-required` already reports the state and putting it in the name
as well makes some screen readers say it twice. The indicator says the word
rather than an asterisk, so nobody has to be told elsewhere what a marker
means.

Shared by the three React widget sets so they cannot drift on it.

## Parameters

### \_\_namedParameters

[`FieldLabelContentProps`](../interfaces/FieldLabelContentProps.md)

## Returns

`Element`
