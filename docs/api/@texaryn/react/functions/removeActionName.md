[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / removeActionName

# Function: removeActionName()

> **removeActionName**(`position`, `itemTitle`, `arrayTitle`): `string`

Accessible names for the controls an array renders.

Five identical "Remove" buttons tell a screen reader user nothing about
which row they act on. The name carries the current 1-based position, which
is what a person means by "the second contact"; the stable item id is
implementation identity and means nothing to them.

The row's own value is deliberately not used. It is mutable, often blank,
frequently duplicated, sometimes long, and sometimes sensitive.

Titles come from the schema: the array's own title, and the item title,
which repeats across rows and so cannot distinguish them on its own. Each
name degrades cleanly as those go missing.

## Parameters

### position

`number`

### itemTitle

`string` \| `undefined`

### arrayTitle

`string` \| `undefined`

## Returns

`string`
