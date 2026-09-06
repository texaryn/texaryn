[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/web-components](../README.md) / texarynFormElementClass

# Function: texarynFormElementClass()

> **texarynFormElementClass**(): `CustomElementConstructor`

Builds the class on first use rather than at module load. It extends
`HTMLElement`, which does not exist outside a browser, and a package that
throws on import cannot be loaded by a server rendered application or by any
tool that merely resolves it.

## Returns

`CustomElementConstructor`
