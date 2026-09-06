[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / FormProvider

# Function: FormProvider()

> **FormProvider**(`__namedParameters`): `Element`

The rendering surface, and therefore the DOM namespace, for one form.

The prefix is owned here rather than by useForm because one runtime can
legitimately be rendered twice; a prefix taken from the runtime would give
both surfaces the same ids. It is provided above the children so that
siblings of FormRoot, ErrorSummary in particular, resolve the same namespace
the fields do.

## Parameters

### \_\_namedParameters

[`FormProviderProps`](../interfaces/FormProviderProps.md)

## Returns

`Element`
