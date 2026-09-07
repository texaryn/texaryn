[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / ErrorProps

# Interface: ErrorProps

HTML/ARIA attributes for an error container.

The container is a live region that exists from mount and is empty while the
field is valid, because a region inserted with its content already in place
is not reliably announced. It is polite rather than an alert: validation runs
on change, blur and submit, so assertive would interrupt typing and would
speak once per failing field on submit.

## Extends

- `Record`\<`string`, `unknown`\>

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### aria-atomic

> **aria-atomic**: `true`

***

### aria-live

> **aria-live**: `"polite"`

***

### id

> **id**: `string`
