[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / useStore

# Function: useStore()

## Call Signature

> **useStore**\<`T`\>(`source`, `fallback`): `Ref`\<`T`\>

A Texaryn store, read as a Vue ref.

This is where the two bindings genuinely diverge rather than differ in
spelling. React's `useStore` re-runs on every render, so it re-reads the
store expression each time and `useSyncExternalStore` swaps subscriptions
for free. A Vue composable runs once in `setup`, so the subscription has to
be managed: accepting a getter and watching it is what replaces the
re-render.

`shallowRef` rather than `ref`: snapshots are plain data owned by the
runtime, and deep reactive conversion would both cost a proxy walk per
update and hand callers a mutable view of state they do not own.

### Type Parameters

#### T

`T`

### Parameters

#### source

[`Store`](../../core/interfaces/Store.md)\<`T`\> \| (() => [`Store`](../../core/interfaces/Store.md)\<`T`\> \| `undefined`)

#### fallback

`T`

### Returns

`Ref`\<`T`\>

## Call Signature

> **useStore**\<`T`\>(`source`): `Ref`\<`T` \| `undefined`\>

A Texaryn store, read as a Vue ref.

This is where the two bindings genuinely diverge rather than differ in
spelling. React's `useStore` re-runs on every render, so it re-reads the
store expression each time and `useSyncExternalStore` swaps subscriptions
for free. A Vue composable runs once in `setup`, so the subscription has to
be managed: accepting a getter and watching it is what replaces the
re-render.

`shallowRef` rather than `ref`: snapshots are plain data owned by the
runtime, and deep reactive conversion would both cost a proxy walk per
update and hand callers a mutable view of state they do not own.

### Type Parameters

#### T

`T`

### Parameters

#### source

[`Store`](../../core/interfaces/Store.md)\<`T`\> \| (() => [`Store`](../../core/interfaces/Store.md)\<`T`\> \| `undefined`)

### Returns

`Ref`\<`T` \| `undefined`\>
