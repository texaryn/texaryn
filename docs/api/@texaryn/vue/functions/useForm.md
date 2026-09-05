[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / useForm

# Function: useForm()

> **useForm**(`port`, `options?`): [`UseFormReturn`](../interfaces/UseFormReturn.md)

Creates the runtime once and ties its lifetime to the calling scope.

React needs a ref plus an effect to avoid recreating the runtime on every
render. `setup` runs once, so the runtime is simply a local, and the whole
question disappears rather than being solved differently. What replaces it
is the requirement of a scope: the runtime's lifetime is the scope's.

Providing is deliberately not folded in here. React's equivalent is a
component in the template, `<FormProvider value={form.runtime}>`, and Vue's
is a setup call, so `provideFormRuntime` stays the caller's explicit second
step rather than a side effect of construction.

## Parameters

### port

[`SchemaEvaluationPort`](../../core/interfaces/SchemaEvaluationPort.md)

### options?

[`FormRuntimeOptions`](../../core/interfaces/FormRuntimeOptions.md)

## Returns

[`UseFormReturn`](../interfaces/UseFormReturn.md)
