[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / setAtPointer

# Function: setAtPointer()

> **setAtPointer**(`data`, `pointer`, `value`): `unknown`

Returns `data` with `value` written at `pointer`, without mutating it.

The contract, because this is exported and its behaviour was previously
stated nowhere:

1. Only own members are read on the way. Inherited JavaScript properties are
   not members of a JSON document.
2. The empty pointer replaces the whole document.
3. A level that is absent is created as an object, whatever its key looks
   like. A numeric key does not imply an array.
4. `null` is created through, like absence: neither holds a payload to
   preserve, so an explicit write may turn either into a container.
5. A scalar on the path throws. Turning it into a container would destroy a
   value the caller supplied.
6. On an array, a canonical index (`0`, or digits with no leading zero)
   writes that element, and `-` appends, both per RFC 6901.
7. Any other token on an array throws. `01` and `1x` are not indices, and
   coercing them wrote to an element the reader could never address.
8. An index past `length` throws. Extending an array leaves holes, which
   serialize as `null`, so the caller would submit values no schema
   described.

The reader is total where this throws, and that asymmetry is deliberate:
reading a location that does not exist yields `undefined`, while writing
where nothing can be written is an error. Both agree on what the location
is; they differ on what to do about it.

## Parameters

### data

`unknown`

### pointer

[`JsonPointer`](../type-aliases/JsonPointer.md)

### value

`unknown`

## Returns

`unknown`
