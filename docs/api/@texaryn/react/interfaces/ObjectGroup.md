[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / ObjectGroup

# Interface: ObjectGroup

## Properties

### children

> **children**: [`UINode`](../../core/type-aliases/UINode.md)[]

***

### nested

> **nested**: `boolean`

Fixed for the widget's lifetime. The root object is the form itself, so
only a nested object is a candidate for being a named group.

***

### title

> **title**: `string` \| `undefined`

Live, because a conditional subschema can add or drop a title on any
recompile while this widget survives. Undefined means the group has no
name, and an unnamed group is noise.
