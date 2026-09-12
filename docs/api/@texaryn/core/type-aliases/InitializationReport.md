[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / InitializationReport

# Type Alias: InitializationReport

> **InitializationReport** = \{ `conflicts`: readonly [`DefaultConflict`](../interfaces/DefaultConflict.md)[]; `outcome`: `"initialized"`; `passes`: `number`; `refusals`: readonly [`DefaultRefusal`](../interfaces/DefaultRefusal.md)[]; \} \| \{ `outcome`: `"budget-exhausted"`; `passes`: `number`; \}

What one run of ADR-003's initialization pass did, without the data, which
the runtime publishes on `data` like any other.

A discarded run reports only that it was discarded. Carrying the conflicts
and refusals of the run that produced them would say a run found them and
then say nothing was written, and the two readings are not the same claim.

## Union Members

### Type Literal

\{ `conflicts`: readonly [`DefaultConflict`](../interfaces/DefaultConflict.md)[]; `outcome`: `"initialized"`; `passes`: `number`; `refusals`: readonly [`DefaultRefusal`](../interfaces/DefaultRefusal.md)[]; \}

#### conflicts

> `readonly` **conflicts**: readonly [`DefaultConflict`](../interfaces/DefaultConflict.md)[]

Locations left absent because their applicable declarations disagreed.

#### outcome

> `readonly` **outcome**: `"initialized"`

#### passes

> `readonly` **passes**: `number`

#### refusals

> `readonly` **refusals**: readonly [`DefaultRefusal`](../interfaces/DefaultRefusal.md)[]

Locations left absent because filling would have meant guessing or destroying.

***

### Type Literal

\{ `outcome`: `"budget-exhausted"`; `passes`: `number`; \}
