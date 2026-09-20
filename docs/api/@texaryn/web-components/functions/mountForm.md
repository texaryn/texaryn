[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/web-components](../README.md) / mountForm

# Function: mountForm()

> **mountForm**(`container`, `runtime`, `__namedParameters`): [`Mount`](../interfaces/Mount.md)

Renders a runtime's document into a container and follows every recompile
by updating the root binding in place. The runtime is borrowed: unmounting
releases subscriptions and DOM, never the runtime.

## Parameters

### container

`HTMLElement`

### runtime

[`FormRuntime`](../../core/interfaces/FormRuntime.md)

### \_\_namedParameters

[`MountOptions`](../interfaces/MountOptions.md)

## Returns

[`Mount`](../interfaces/Mount.md)
